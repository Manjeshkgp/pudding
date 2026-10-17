import { NextRequest } from "next/server";
import { AgeGroup, LessonTopic } from "@prisma/client";
import prisma from "@/lib/prisma";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth-guard";
import { ensureLessonsAndBadgesSeeded } from "@/services/education.service";

/**
 * GET /api/lessons
 * Lists age-tiered financial lessons (saving, needs vs. wants, budgeting, interest, scams)
 * along with the child's quiz completion status and earned badges (FR-9.1, FR-9.2).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    await ensureLessonsAndBadgesSeeded();

    const ageGroupParam = req.nextUrl.searchParams.get(
      "ageGroup"
    ) as AgeGroup | null;
    const topicParam = req.nextUrl.searchParams.get(
      "topic"
    ) as LessonTopic | null;
    const childIdParam = req.nextUrl.searchParams.get("childId");

    const targetChildId =
      session.subjectType === "CHILD" ? session.sub : childIdParam;

    const [lessons, progressList, badges, earnedBadges] = await Promise.all([
      prisma.lesson.findMany({
        where: {
          isActive: true,
          ...(ageGroupParam ? { ageGroup: ageGroupParam } : {}),
          ...(topicParam ? { topic: topicParam } : {}),
        },
        orderBy: { orderIndex: "asc" },
      }),
      targetChildId
        ? prisma.lessonProgress.findMany({
            where: { childId: targetChildId },
          })
        : Promise.resolve([]),
      prisma.badge.findMany({
        orderBy: { createdAt: "asc" },
      }),
      targetChildId
        ? prisma.childBadge.findMany({
            where: { childId: targetChildId },
            include: { badge: true },
          })
        : Promise.resolve([]),
    ]);

    const progressMap = new Map(progressList.map((p) => [p.lessonId, p]));

    return apiSuccess({
      lessons: lessons.map((lesson) => {
        const prog = progressMap.get(lesson.id);
        return {
          id: lesson.id,
          title: lesson.title,
          slug: lesson.slug,
          topic: lesson.topic,
          ageGroup: lesson.ageGroup,
          summary: lesson.summary,
          content: lesson.content,
          quizQuestions: lesson.quizQuestions,
          xpReward: lesson.xpReward,
          defaultMoneyReward: lesson.defaultMoneyReward.toString(),
          badgeCode: lesson.badgeCode,
          orderIndex: lesson.orderIndex,
          childProgress: prog
            ? {
                completed: prog.completed,
                score: prog.score,
                rewardPaid: prog.rewardPaid.toString(),
                completedAt: prog.completedAt,
              }
            : null,
        };
      }),
      badges,
      earnedBadges,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
