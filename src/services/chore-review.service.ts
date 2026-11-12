import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";
import { calculateBucketSplit } from "@/services/ledger.service";
import { taskRewardSplit } from "@/lib/task-reward";
import { notifyWithPush } from "@/services/notification.service";
import { RequestMeta, writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";
export async function reviewChore({
  familyId,
  actorUserId,
  actorRole,
  id,
  input,
  meta,
  automatic = false,
}: {
  familyId: string;
  actorUserId: string | null;
  actorRole: string;
  id: string;
  input: {
    decision: "APPROVE" | "REJECT";
    parentComment?: string;
    bonusAmount?: number;
    idempotencyKey?: string;
  };
  meta?: RequestMeta;
  automatic?: boolean;
}) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Family" WHERE "id" = ${familyId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "ChoreSubmission" WHERE "id" = ${id} FOR UPDATE`;
    const submission = await tx.choreSubmission.findUnique({
      where: { id },
      include: { chore: true },
    });
    if (!submission || submission.chore.familyId !== familyId)
      throw new ApiError(404, "Task submission not found.");
    await tx.$queryRaw`SELECT "id" FROM "Child" WHERE "id" = ${submission.childId} FOR UPDATE`;
    const child = await tx.child.findUniqueOrThrow({
      where: { id: submission.childId },
    });
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { childId: child.id },
    });
    if (automatic && submission.status !== "PENDING")
      return {
        submission,
        child,
        wallet,
        replay: true,
        streakBonus: new Prisma.Decimal(0),
      };
    if (
      automatic &&
      (submission.aiStatus !== "COMPLETED" ||
        submission.aiVerdict !== "SUPPORTED")
    )
      throw new ApiError(409, "AI has not supported this task.");
    if (
      automatic &&
      (child.isFrozen ||
        wallet.isFrozen ||
        (await tx.family.findUniqueOrThrow({ where: { id: familyId } }))
          .isFrozen)
    )
      throw new ApiError(
        409,
        "This wallet is paused. A parent must review the task.",
      );
    if (submission.status !== "PENDING") {
      if (
        (submission.status === "APPROVED" && input.decision === "APPROVE") ||
        (submission.status === "REJECTED" && input.decision === "REJECT")
      )
        return {
          submission,
          child,
          wallet,
          replay: true,
          streakBonus: new Prisma.Decimal(0),
        };
      throw new ApiError(
        409,
        "This task has already been reviewed.",
        "SUBMISSION_ALREADY_REVIEWED",
      );
    }
    if (input.decision === "REJECT") {
      const updated = await tx.choreSubmission.update({
        where: { id },
        data: {
          status: "REJECTED",
          parentComment: input.parentComment || null,
          reviewedByUserId: actorUserId,
          reviewedAt: new Date(),
        },
      });
      await writeAuditLog(
        {
          familyId: familyId,
          actorUserId: actorUserId,
          actorRole: actorRole,
          action: "CHORE_SUBMISSION_REJECTED",
          targetType: "ChoreSubmission",
          targetId: id,
          ...meta,
        },
        tx,
      );
      return {
        submission: updated,
        child,
        wallet,
        replay: false,
        streakBonus: new Prisma.Decimal(0),
      };
    }
    const now = new Date();
    const nextStreak =
      !child.lastChoreCompletedAt ||
      now.getTime() - child.lastChoreCompletedAt.getTime() <= 172800000
        ? child.streakCount + 1
        : 1;
    const milestone = nextStreak % 5 === 0;
    const base = submission.chore.rewardAmount.plus(input.bonusAmount || 0);
    const balance = (
      await tx.family.findUniqueOrThrow({ where: { id: familyId } })
    ).unallocatedBudget;
    if (balance.lt(base))
      throw new ApiError(
        409,
        "Your family needs more unallocated allowance for this reward. Add a top-up, then retry.",
        "INSUFFICIENT_FAMILY_BUDGET",
      );
    const streakBonus =
      milestone && balance.gte(base.plus(1))
        ? new Prisma.Decimal(1)
        : new Prisma.Decimal(0);
    for (const reward of [
      {
        amount: base,
        type: "CHORE_REWARD" as const,
        key: `chore:${id}:reward`,
      },
      {
        amount: streakBonus,
        type: "CHORE_STREAK_BONUS" as const,
        key: `chore:${id}:streak`,
      },
    ]) {
      if (reward.amount.equals(0)) continue;
      const split = calculateBucketSplit(
        reward.amount,
        taskRewardSplit.spend,
        taskRewardSplit.save,
      );
      await tx.family.update({
        where: { id: familyId },
        data: { unallocatedBudget: { decrement: reward.amount } },
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          spendBalance: { increment: split.spend },
          saveBalance: { increment: split.save },
        },
      });
      await tx.ledgerEntry.create({
        data: {
          familyId: familyId,
          childId: child.id,
          walletBucket: "FAMILY_BUDGET",
          amount: reward.amount,
          direction: "DEBIT",
          type: reward.type,
          idempotencyKey: `${reward.key}:family`,
          referenceId: id,
          actorUserId: actorUserId,
          description: `Task reward: ${submission.chore.title}`,
        },
      });
      for (const [bucket, amount] of [
        ["SPEND", split.spend],
        ["SAVE", split.save],
      ] as const) {
        if (amount.gt(0))
          await tx.ledgerEntry.create({
            data: {
              familyId: familyId,
              childId: child.id,
              walletBucket: bucket,
              amount,
              direction: "CREDIT",
              type: reward.type,
              idempotencyKey: `${reward.key}:${bucket}`,
              referenceId: id,
              actorUserId: actorUserId,
              description: `Task reward: ${submission.chore.title}`,
            },
          });
      }
    }
    const updated = await tx.choreSubmission.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvalSource: automatic ? "AI" : "PARENT",
        rewardAmountPaid: base.plus(streakBonus),
        parentComment: input.parentComment || null,
        reviewedByUserId: actorUserId,
        reviewedAt: now,
      },
    });
    const xp = child.xp + 25 + (milestone ? 50 : 0);
    const updatedChild = await tx.child.update({
      where: { id: child.id },
      data: {
        streakCount: nextStreak,
        lastChoreCompletedAt: now,
        xp,
        level: Math.floor(xp / 200) + 1,
      },
    });
    if (submission.chore.recurrence === "ONCE") {
      const approved = await tx.choreSubmission.findMany({
        where: { choreId: submission.choreId, status: "APPROVED" },
        select: { childId: true },
      });
      if (
        submission.chore.assigneeIds.every((k) =>
          approved.some((a) => a.childId === k),
        )
      )
        await tx.chore.update({
          where: { id: submission.choreId },
          data: { isActive: false },
        });
    }
    await writeAuditLog(
      {
        familyId: familyId,
        actorUserId: actorUserId,
        actorRole: actorRole,
        action: "CHORE_SUBMISSION_APPROVED",
        targetType: "ChoreSubmission",
        targetId: id,
        details: {
          rewardPaid: base.plus(streakBonus).toString(),
          streakCount: nextStreak,
        },
        ...meta,
      },
      tx,
    );
    return {
      submission: updated,
      child: updatedChild,
      wallet: await tx.wallet.findUniqueOrThrow({
        where: { childId: child.id },
      }),
      replay: false,
      streakBonus,
    };
  });
  if (!result.replay) {
    try {
      await notifyWithPush({
        familyId: familyId,
        childId: result.child.id,
        type:
          input.decision === "APPROVE" ? "CHORE_APPROVED" : "CHORE_REJECTED",
        title:
          input.decision === "APPROVE"
            ? "Task approved!"
            : "A little more to do",
        message:
          input.decision === "APPROVE"
            ? `${automatic ? "Gemini supported your task evidence." : "Your parent approved your task."} Reward: $${result.submission.rewardAmountPaid?.toFixed(2) || "0.00"}, split ${taskRewardSplit.spend}% to Spend and ${taskRewardSplit.save}% to Savings.`
            : input.parentComment ||
              "Your parent asked you to try this task again.",
      });
    } catch (error) {
      logger.warn("chore.notification_failed", { requestId: id }, error);
    }
  }
  return {
    submission: result.submission,
    childProgress: {
      streakCount: result.child.streakCount,
      xp: result.child.xp,
      level: result.child.level,
      streakBonusEarned: result.streakBonus.toString(),
    },
    wallet: result.wallet,
    idempotentReplay: result.replay,
  };
}
