import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { requireAuth } from "@/lib/auth-guard";
import { transferFromFamilyToChild } from "@/services/ledger.service";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const completeLessonSchema = z.object({
  childId: z.string().trim().optional(),
  answers: z.array(z.number().int().min(0)).min(1, "Quiz answers are required"),
  payMoneyReward: z.boolean().optional().default(true),
});

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

/**
 * POST /api/lessons/[id]/complete
 * Grades a child's lesson quiz answers, awards XP & Badges, and credits an optional
 * parent-funded lesson reward from the Family Budget (FR-9.1, FR-9.2).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lessonId } = await context.params;
    const session = await requireAuth(req);
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, completeLessonSchema);

    const targetChildId =
      session.subjectType === "CHILD" ? session.sub : input.childId;

    if (!targetChildId) {
      throw new ApiError(400, "childId is required when submitting as a parent");
    }

    const [lesson, child] = await Promise.all([
      prisma.lesson.findUnique({ where: { id: lessonId } }),
      prisma.child.findUnique({
        where: { id: targetChildId },
        include: { family: true },
      }),
    ]);

    if (!lesson || !lesson.isActive) {
      throw new ApiError(404, "Lesson not found", "LESSON_NOT_FOUND");
    }

    if (!child || child.familyId !== session.familyId) {
      throw new ApiError(404, "Child not found", "CHILD_NOT_FOUND");
    }

    const questions = (lesson.quizQuestions as unknown as QuizQuestion[]) || [];
    let correctCount = 0;

    const feedback = questions.map((q, idx) => {
      const submittedAnswer = input.answers[idx];
      const isCorrect = submittedAnswer === q.correctIndex;
      if (isCorrect) correctCount += 1;
      return {
        questionIndex: idx,
        question: q.question,
        submittedAnswer,
        correctIndex: q.correctIndex,
        isCorrect,
        explanation: q.explanation ?? null,
      };
    });

    const scorePercent =
      questions.length > 0
        ? Math.round((correctCount / questions.length) * 100)
        : 100;

    // Require at least 50% score to pass the lesson
    const passed = scorePercent >= 50;
    if (!passed) {
      return apiSuccess(
        {
          passed: false,
          scorePercent,
          correctCount,
          totalQuestions: questions.length,
          feedback,
        },
        200,
        `You scored ${scorePercent}%. Review the explanations and try again to earn your badge!`
      );
    }

    // Check if already completed previously (to prevent paying money/XP twice)
    const existingProgress = await prisma.lessonProgress.findUnique({
      where: {
        childId_lessonId: {
          childId: child.id,
          lessonId: lesson.id,
        },
      },
    });

    const alreadyCompleted = Boolean(existingProgress?.completed);
    let rewardPaid = new Prisma.Decimal(0);
    let unlockedBadge = null;

    if (!alreadyCompleted) {
      // Pay optional parent-funded money reward if family budget has funds (FR-9.2)
      if (input.payMoneyReward && lesson.defaultMoneyReward.gt(0)) {
        try {
          await transferFromFamilyToChild({
            familyId: child.familyId,
            childId: child.id,
            amount: lesson.defaultMoneyReward,
            idempotencyKey: `lesson-reward:${child.id}:${lesson.id}`,
            entryType: "LESSON_REWARD",
            targetBucket: "DEFAULT_SPLIT",
            referenceId: lesson.id,
            description: `Completed financial lesson: "${lesson.title}"`,
          });
          rewardPaid = lesson.defaultMoneyReward;
        } catch {
          // If family budget has $0, still complete lesson and award XP/badge without failing
          rewardPaid = new Prisma.Decimal(0);
        }
      }

      // Award badge if lesson has a badgeCode
      let badgeBonusXp = 0;
      if (lesson.badgeCode) {
        const badge = await prisma.badge.findUnique({
          where: { code: lesson.badgeCode },
        });
        if (badge) {
          await prisma.childBadge.upsert({
            where: {
              childId_badgeId: {
                childId: child.id,
                badgeId: badge.id,
              },
            },
            update: {},
            create: {
              childId: child.id,
              badgeId: badge.id,
            },
          });
          unlockedBadge = badge;
          badgeBonusXp = badge.xpBonus;
        }
      }

      const totalXpGained = lesson.xpReward + badgeBonusXp;
      const nextXp = child.xp + totalXpGained;
      const nextLevel = Math.floor(nextXp / 200) + 1;

      await prisma.child.update({
        where: { id: child.id },
        data: {
          xp: nextXp,
          level: nextLevel,
        },
      });
    }

    const savedProgress = await prisma.lessonProgress.upsert({
      where: {
        childId_lessonId: {
          childId: child.id,
          lessonId: lesson.id,
        },
      },
      create: {
        childId: child.id,
        lessonId: lesson.id,
        score: scorePercent,
        completed: true,
        rewardPaid,
        completedAt: new Date(),
      },
      update: {
        score: Math.max(existingProgress?.score ?? 0, scorePercent),
        completed: true,
      },
    });

    if (!alreadyCompleted) {
      await prisma.notification.create({
        data: {
          familyId: child.familyId,
          childId: child.id,
          type: "LESSON_COMPLETED",
          title: `Lesson Completed: ${lesson.title}!`,
          message: rewardPaid.gt(0)
            ? `You scored ${scorePercent}%, earned ${lesson.xpReward} XP, and got a $${rewardPaid.toFixed(2)} learning reward!`
            : `You scored ${scorePercent}% and earned ${lesson.xpReward} XP!`,
          channel: "IN_APP",
        },
      });

      await writeAuditLog({
        familyId: child.familyId,
        actorUserId: session.subjectType === "USER" ? session.sub : null,
        actorChildId: session.subjectType === "CHILD" ? session.sub : null,
        actorRole: session.role,
        action: "LESSON_COMPLETED",
        targetType: "Lesson",
        targetId: lesson.id,
        details: {
          childId: child.id,
          scorePercent,
          rewardPaid: rewardPaid.toString(),
          badgeUnlocked: unlockedBadge?.code ?? null,
        },
        ipAddress,
        userAgent,
      });
    }

    return apiSuccess(
      {
        passed: true,
        alreadyCompleted,
        scorePercent,
        correctCount,
        totalQuestions: questions.length,
        xpEarned: alreadyCompleted ? 0 : lesson.xpReward,
        rewardPaid: savedProgress.rewardPaid.toString(),
        unlockedBadge,
        feedback,
      },
      200,
      alreadyCompleted
        ? `Quiz passed with ${scorePercent}%!`
        : `Awesome! You completed "${lesson.title}" with ${scorePercent}%!`
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
