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
import { requireParent } from "@/lib/auth-guard";
import { transferFromFamilyToChild } from "@/services/ledger.service";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const STREAK_MILESTONE_EVERY = 5; // Every 5 completed chores in a streak awards a bonus (FR-5.5)
const STREAK_BONUS_AMOUNT = new Prisma.Decimal("1.00");

const reviewSubmissionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  parentComment: z.string().trim().max(300).optional(),
  bonusAmount: z.number().min(0).max(100).optional(),
  idempotencyKey: z.string().trim().min(4).max(128).optional(),
});

/**
 * POST /api/chore-submissions/[id]/review
 * Parent approves or rejects a child's chore submission with an optional comment (FR-5.4).
 * Approval triggers:
 * 1. Atomic virtual reward payment from Family Unallocated Budget -> Child Wallet (split across Spend/Save/Give).
 * 2. Chore streak counter increment and automatic streak milestone bonus (FR-5.5).
 * 3. XP & Level up progression (FR-11.3).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await context.params;
    const { user, family } = await requireParent(req, "canApproveChores");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, reviewSubmissionSchema);

    const submission = await prisma.choreSubmission.findUnique({
      where: { id: submissionId },
      include: {
        chore: true,
        child: {
          include: { wallet: true },
        },
      },
    });

    if (!submission || submission.chore.familyId !== family.id) {
      throw new ApiError(
        404,
        "Chore submission not found in your family",
        "SUBMISSION_NOT_FOUND"
      );
    }

    if (submission.status !== "PENDING") {
      throw new ApiError(
        409,
        `This submission has already been reviewed (status: ${submission.status})`,
        "SUBMISSION_ALREADY_REVIEWED"
      );
    }

    if (input.decision === "REJECT") {
      const rejected = await prisma.choreSubmission.update({
        where: { id: submission.id },
        data: {
          status: "REJECTED",
          parentComment: input.parentComment ?? null,
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
        },
      });

      await prisma.notification.create({
        data: {
          familyId: family.id,
          childId: submission.childId,
          type: "CHORE_REJECTED",
          title: `Try again on "${submission.chore.title}"`,
          message:
            input.parentComment ||
            `${user.name} asked you to check "${submission.chore.title}" and submit again.`,
          channel: "IN_APP",
        },
      });

      await writeAuditLog({
        familyId: family.id,
        actorUserId: user.id,
        actorRole: user.role,
        action: "CHORE_SUBMISSION_REJECTED",
        targetType: "ChoreSubmission",
        targetId: submission.id,
        details: {
          choreId: submission.choreId,
          childId: submission.childId,
          parentComment: input.parentComment,
        },
        ipAddress,
        userAgent,
      });

      return apiSuccess(
        { submission: rejected },
        200,
        "Chore submission marked as needs retry"
      );
    }

    // APPROVE flow
    const baseReward = submission.chore.rewardAmount;
    const customBonus = new Prisma.Decimal(input.bonusAmount || 0);

    // Calculate streak progression (FR-5.5)
    const now = new Date();
    const lastCompleted = submission.child.lastChoreCompletedAt;
    const hoursSinceLast = lastCompleted
      ? (now.getTime() - lastCompleted.getTime()) / (1000 * 60 * 60)
      : 0;

    // Maintain streak if completed within 48 hours of previous chore (or first chore)
    const nextStreak =
      !lastCompleted || hoursSinceLast <= 48
        ? submission.child.streakCount + 1
        : 1;

    const earnedMilestoneStreakBonus =
      nextStreak > 0 && nextStreak % STREAK_MILESTONE_EVERY === 0;
    const streakBonus = earnedMilestoneStreakBonus
      ? STREAK_BONUS_AMOUNT
      : new Prisma.Decimal(0);

    const totalRewardToPay = baseReward.plus(customBonus);
    const idempotencyBase =
      input.idempotencyKey || `chore-approve:${submission.id}`;

    // 1. Pay chore reward if > 0
    if (totalRewardToPay.gt(0)) {
      await transferFromFamilyToChild({
        familyId: family.id,
        childId: submission.childId,
        amount: totalRewardToPay,
        idempotencyKey: idempotencyBase,
        entryType: "CHORE_REWARD",
        targetBucket: "DEFAULT_SPLIT",
        referenceId: submission.id,
        actorUserId: user.id,
        description: `Chore reward for "${submission.chore.title}"`,
        metadata: {
          choreId: submission.choreId,
          submissionId: submission.id,
          baseReward: baseReward.toString(),
          customBonus: customBonus.toString(),
        },
      });
    }

    // 2. Pay streak bonus if milestone reached (FR-5.5)
    let streakBonusPaid = new Prisma.Decimal(0);
    if (streakBonus.gt(0)) {
      try {
        await transferFromFamilyToChild({
          familyId: family.id,
          childId: submission.childId,
          amount: streakBonus,
          idempotencyKey: `${idempotencyBase}:streak-bonus`,
          entryType: "CHORE_STREAK_BONUS",
          targetBucket: "DEFAULT_SPLIT",
          referenceId: submission.id,
          actorUserId: user.id,
          description: `${nextStreak}-Chore Streak Bonus!`,
        });
        streakBonusPaid = streakBonus;
      } catch {
        // If family budget couldn't cover the extra $1 streak bonus, don't fail the main chore approval
        streakBonusPaid = new Prisma.Decimal(0);
      }
    }

    const totalPaid = totalRewardToPay.plus(streakBonusPaid);
    const newXp = submission.child.xp + 25 + (earnedMilestoneStreakBonus ? 50 : 0);
    const newLevel = Math.floor(newXp / 200) + 1;

    const [updatedSubmission, updatedChild] = await prisma.$transaction([
      prisma.choreSubmission.update({
        where: { id: submission.id },
        data: {
          status: "APPROVED",
          parentComment: input.parentComment ?? null,
          reviewedByUserId: user.id,
          rewardAmountPaid: totalPaid,
          reviewedAt: now,
        },
      }),
      prisma.child.update({
        where: { id: submission.childId },
        data: {
          streakCount: nextStreak,
          lastChoreCompletedAt: now,
          xp: newXp,
          level: newLevel,
        },
        include: { wallet: true },
      }),
      // If chore is ONCE, mark it inactive after approval
      ...(submission.chore.recurrence === "ONCE"
        ? [
            prisma.chore.update({
              where: { id: submission.choreId },
              data: { isActive: false },
            }),
          ]
        : []),
    ]);

    await prisma.notification.create({
      data: {
        familyId: family.id,
        childId: submission.childId,
        type: "CHORE_APPROVED",
        title: "Chore Approved!",
        message: streakBonusPaid.gt(0)
          ? `Awesome! You earned $${totalRewardToPay.toFixed(2)} for "${submission.chore.title}" PLUS a $${streakBonusPaid.toFixed(2)} ${nextStreak}-chore streak bonus!`
          : `Awesome! You earned $${totalRewardToPay.toFixed(2)} for completing "${submission.chore.title}"!`,
        channel: "IN_APP",
      },
    });

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: "CHORE_SUBMISSION_APPROVED",
      targetType: "ChoreSubmission",
      targetId: submission.id,
      details: {
        choreId: submission.choreId,
        childId: submission.childId,
        rewardPaid: totalPaid.toString(),
        streakCount: nextStreak,
        streakBonusPaid: streakBonusPaid.toString(),
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      {
        submission: {
          ...updatedSubmission,
          rewardAmountPaid:
            updatedSubmission.rewardAmountPaid?.toString() ?? "0.00",
        },
        childProgress: {
          streakCount: updatedChild.streakCount,
          xp: updatedChild.xp,
          level: updatedChild.level,
          streakBonusEarned: streakBonusPaid.toString(),
        },
        wallet: updatedChild.wallet
          ? {
              spendBalance: updatedChild.wallet.spendBalance.toString(),
              saveBalance: updatedChild.wallet.saveBalance.toString(),
              giveBalance: updatedChild.wallet.giveBalance.toString(),
            }
          : null,
      },
      200,
      "Chore approved and reward credited to child wallet"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
