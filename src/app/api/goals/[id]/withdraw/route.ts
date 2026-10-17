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
import { requireChildOrFamilyParent } from "@/lib/auth-guard";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const withdrawGoalSchema = z.object({
  amount: z.number().positive().max(50000).optional(), // Omit to withdraw full goal amount
  destinationBucket: z.enum(["SPEND", "SAVE"]).default("SPEND"),
  idempotencyKey: z.string().trim().min(4).max(128).optional(),
});

/**
 * POST /api/goals/[id]/withdraw
 * Withdraws funds from a Savings Goal back into the child's SPEND or SAVE bucket.
 * Enforces FR-6.6: If `isLocked == true` and the caller is a Child, blocks withdrawal
 * until a parent sets `unlockApprovedByParent = true` (or a parent performs the withdrawal).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: goalId } = await context.params;
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, withdrawGoalSchema);

    const goal = await prisma.savingsGoal.findUnique({
      where: { id: goalId },
    });

    if (!goal) {
      throw new ApiError(404, "Savings goal not found", "GOAL_NOT_FOUND");
    }

    const { session, child, isParent } = await requireChildOrFamilyParent(
      req,
      goal.childId
    );

    if (!isParent && goal.isLocked && !goal.unlockApprovedByParent) {
      // Notify parent that child requested goal unlock (FR-6.6)
      await prisma.notification.create({
        data: {
          familyId: child.familyId,
          type: "GOAL_UNLOCK_REQUESTED",
          title: `${child.name} requested to unlock "${goal.name}"`,
          message: `${child.name} wants to withdraw from their locked savings goal "${goal.name}" ($${goal.currentAmount.toFixed(2)}).`,
          metadata: { goalId: goal.id, childId: child.id },
          channel: "IN_APP",
        },
      });

      throw new ApiError(
        403,
        "This savings goal is locked until your parent approves withdrawal (FR-6.6). We notified your parent!",
        "GOAL_LOCKED_PENDING_PARENT"
      );
    }

    const withdrawAmount = input.amount
      ? new Prisma.Decimal(input.amount).toDecimalPlaces(2)
      : goal.currentAmount;

    if (withdrawAmount.lte(0) || withdrawAmount.gt(goal.currentAmount)) {
      throw new ApiError(
        400,
        `Invalid withdrawal amount. Goal has $${goal.currentAmount.toFixed(2)} available.`,
        "INVALID_WITHDRAWAL_AMOUNT"
      );
    }

    const idempotencyKey =
      input.idempotencyKey ||
      req.headers.get("x-idempotency-key") ||
      `goal-withdraw:${goal.id}:${Date.now()}`;

    const bucketField =
      input.destinationBucket === "SPEND" ? "spendBalance" : "saveBalance";

    const result = await prisma.$transaction(async (tx) => {
      const remaining = goal.currentAmount.minus(withdrawAmount);

      const updatedGoal = await tx.savingsGoal.update({
        where: { id: goal.id },
        data: {
          currentAmount: remaining,
          status: remaining.lte(0) ? "WITHDRAWN" : goal.status,
        },
      });

      const updatedWallet = await tx.wallet.update({
        where: { childId: child.id },
        data: {
          [bucketField]: { increment: withdrawAmount },
        },
      });

      await tx.ledgerEntry.create({
        data: {
          familyId: child.familyId,
          childId: child.id,
          walletBucket: input.destinationBucket,
          amount: withdrawAmount,
          direction: "CREDIT",
          type: "GOAL_WITHDRAWAL",
          status: "COMPLETED",
          idempotencyKey,
          referenceId: goal.id,
          actorUserId: isParent ? session.sub : null,
          actorChildId: !isParent ? session.sub : null,
          description: `Withdrew $${withdrawAmount.toFixed(2)} from goal "${goal.name}" to ${input.destinationBucket} bucket`,
        },
      });

      await writeAuditLog(
        {
          familyId: child.familyId,
          actorUserId: isParent ? session.sub : null,
          actorChildId: !isParent ? session.sub : null,
          actorRole: session.role,
          action: "SAVINGS_GOAL_WITHDRAWAL",
          targetType: "SavingsGoal",
          targetId: goal.id,
          details: {
            withdrawAmount: withdrawAmount.toString(),
            destinationBucket: input.destinationBucket,
            remainingGoalAmount: remaining.toString(),
          },
          ipAddress,
          userAgent,
        },
        tx
      );

      return { updatedGoal, updatedWallet };
    });

    return apiSuccess(
      {
        goal: {
          ...result.updatedGoal,
          targetAmount: result.updatedGoal.targetAmount.toString(),
          currentAmount: result.updatedGoal.currentAmount.toString(),
        },
        wallet: {
          spendBalance: result.updatedWallet.spendBalance.toString(),
          saveBalance: result.updatedWallet.saveBalance.toString(),
          giveBalance: result.updatedWallet.giveBalance.toString(),
        },
      },
      200,
      `Withdrew $${withdrawAmount.toFixed(2)} to ${input.destinationBucket} bucket`
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
