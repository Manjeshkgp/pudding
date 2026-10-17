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
import { requireChildOrFamilyParent, requireParent } from "@/lib/auth-guard";
import { computeGoalProjection } from "@/services/goals.service";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const depositGoalSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.enum(["SAVE_BUCKET", "SPEND_BUCKET"]),
    amount: z.number().positive("Deposit amount must be greater than 0").max(10000),
    idempotencyKey: z.string().trim().min(4).max(128).optional(),
  }),
  z.object({
    source: z.literal("PARENT_CONTRIBUTION"),
    amount: z.number().positive("Contribution amount must be greater than 0").max(10000),
    idempotencyKey: z.string().trim().min(4).max(128).optional(),
  }),
]);

/**
 * POST /api/goals/[id]/deposit
 * Handles:
 * 1. Child depositing from SAVE_BUCKET or SPEND_BUCKET into a SavingsGoal + automatic Parent Matching (FR-6.3).
 * 2. Direct Parent one-time contribution from Family Unallocated Budget into the child's goal (FR-6.3).
 * 3. Celebration animation flag & notification when goal target is reached (FR-6.5).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: goalId } = await context.params;
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, depositGoalSchema);

    const goal = await prisma.savingsGoal.findUnique({
      where: { id: goalId },
      include: { child: { include: { family: true } } },
    });

    if (!goal) {
      throw new ApiError(404, "Savings goal not found", "GOAL_NOT_FOUND");
    }

    if (goal.status === "WITHDRAWN") {
      throw new ApiError(
        409,
        "Cannot deposit into a withdrawn savings goal",
        "GOAL_WITHDRAWN"
      );
    }

    const headerKey = req.headers.get("x-idempotency-key");

    // Mode 1: Direct Parent Contribution from Family Budget (FR-6.3)
    if (input.source === "PARENT_CONTRIBUTION") {
      const { user, family } = await requireParent(req, "canManageBudget");
      if (goal.child.familyId !== family.id) {
        throw new ApiError(403, "Goal does not belong to your family");
      }

      const amount = new Prisma.Decimal(input.amount).toDecimalPlaces(2);
      const idempotencyKey =
        input.idempotencyKey ||
        headerKey ||
        `goal-parent-contrib:${goal.id}:${user.id}:${Date.now()}`;

      const result = await prisma.$transaction(async (tx) => {
        const familyRows = await tx.$queryRaw<
          Array<{ id: string; unallocatedBudget: Prisma.Decimal }>
        >`SELECT "id", "unallocatedBudget" FROM "Family" WHERE "id" = ${family.id} FOR UPDATE`;

        const lockedFamily = familyRows[0];
        if (
          !lockedFamily ||
          new Prisma.Decimal(lockedFamily.unallocatedBudget).lt(amount)
        ) {
          throw new ApiError(
            400,
            "Insufficient unallocated family budget for parent contribution",
            "INSUFFICIENT_FAMILY_BUDGET"
          );
        }

        await tx.family.update({
          where: { id: family.id },
          data: { unallocatedBudget: { decrement: amount } },
        });

        const nextAmount = goal.currentAmount.plus(amount);
        const reachedGoal = nextAmount.gte(goal.targetAmount);

        const updatedGoal = await tx.savingsGoal.update({
          where: { id: goal.id },
          data: {
            currentAmount: nextAmount,
            ...(reachedGoal && goal.status !== "COMPLETED"
              ? { status: "COMPLETED", completedAt: new Date() }
              : {}),
          },
        });

        await tx.ledgerEntry.create({
          data: {
            familyId: family.id,
            childId: goal.childId,
            walletBucket: "FAMILY_BUDGET",
            amount,
            direction: "DEBIT",
            type: "GOAL_MATCH",
            status: "COMPLETED",
            idempotencyKey,
            referenceId: goal.id,
            actorUserId: user.id,
            description: `Parent contribution to "${goal.name}"`,
          },
        });

        await writeAuditLog(
          {
            familyId: family.id,
            actorUserId: user.id,
            actorRole: user.role,
            action: "GOAL_PARENT_CONTRIBUTION",
            targetType: "SavingsGoal",
            targetId: goal.id,
            details: {
              amount: amount.toString(),
              reachedGoal,
            },
            ipAddress,
            userAgent,
          },
          tx
        );

        return { updatedGoal, reachedGoal };
      });

      if (result.reachedGoal) {
        await prisma.notification.create({
          data: {
            familyId: family.id,
            childId: goal.childId,
            type: "SAVINGS_GOAL_REACHED",
            title: `Goal Reached: ${goal.name}!`,
            message: `Congratulations! You reached your $${goal.targetAmount.toFixed(2)} goal for "${goal.name}"!`,
            metadata: { goalId: goal.id, celebrationAnimation: "CONFETTI_BURST" },
            channel: "IN_APP",
          },
        });
      }

      const projection = await computeGoalProjection(result.updatedGoal);

      return apiSuccess(
        {
          goal: {
            ...result.updatedGoal,
            targetAmount: result.updatedGoal.targetAmount.toString(),
            currentAmount: result.updatedGoal.currentAmount.toString(),
            matchPercentage: result.updatedGoal.matchPercentage.toString(),
            matchedTotalSoFar: result.updatedGoal.matchedTotalSoFar.toString(),
          },
          parentContributionApplied: amount.toString(),
          celebrationTriggered: result.reachedGoal,
          projection,
        },
        200,
        result.reachedGoal
          ? `Goal "${goal.name}" completed!`
          : `Added $${amount.toFixed(2)} parent contribution to "${goal.name}"`
      );
    }

    // Mode 2: Child (or Parent on behalf of Child) deposits from SAVE_BUCKET or SPEND_BUCKET
    const { session, child, isParent } = await requireChildOrFamilyParent(
      req,
      goal.childId
    );

    const depositAmount = new Prisma.Decimal(input.amount).toDecimalPlaces(2);
    const bucketField =
      input.source === "SAVE_BUCKET" ? "saveBalance" : "spendBalance";
    const walletBucketEnum =
      input.source === "SAVE_BUCKET" ? "SAVE" : "SPEND";

    const idempotencyKey =
      input.idempotencyKey ||
      headerKey ||
      `goal-deposit:${goal.id}:${session.sub}:${Date.now()}`;

    const txResult = await prisma.$transaction(async (tx) => {
      // 1. Lock Child Wallet
      const walletRows = await tx.$queryRaw<
        Array<{
          id: string;
          spendBalance: Prisma.Decimal;
          saveBalance: Prisma.Decimal;
          isFrozen: boolean;
        }>
      >`SELECT "id", "spendBalance", "saveBalance", "isFrozen" FROM "Wallet" WHERE "childId" = ${child.id} FOR UPDATE`;

      const lockedWallet = walletRows[0];
      if (!lockedWallet) {
        throw new ApiError(404, "Wallet not found", "WALLET_NOT_FOUND");
      }
      if (lockedWallet.isFrozen) {
        throw new ApiError(403, "Wallet is currently frozen", "WALLET_FROZEN");
      }

      const availableBucketBalance = new Prisma.Decimal(
        lockedWallet[bucketField]
      );
      if (availableBucketBalance.lt(depositAmount)) {
        throw new ApiError(
          400,
          `Insufficient ${walletBucketEnum} balance ($${availableBucketBalance.toFixed(2)} available, $${depositAmount.toFixed(2)} required)`,
          "INSUFFICIENT_BUCKET_BALANCE"
        );
      }

      // 2. Debit Child's Bucket
      const updatedWallet = await tx.wallet.update({
        where: { id: lockedWallet.id },
        data: {
          [bucketField]: { decrement: depositAmount },
        },
      });

      await tx.ledgerEntry.create({
        data: {
          familyId: child.familyId,
          childId: child.id,
          walletBucket: walletBucketEnum,
          amount: depositAmount,
          direction: "DEBIT",
          type: "GOAL_DEPOSIT",
          status: "COMPLETED",
          idempotencyKey,
          referenceId: goal.id,
          actorUserId: isParent ? session.sub : null,
          actorChildId: !isParent ? session.sub : null,
          description: `Deposited $${depositAmount.toFixed(2)} into savings goal "${goal.name}"`,
        },
      });

      // 3. Calculate Parent Matching if configured (FR-6.3)
      let matchApplied = new Prisma.Decimal(0);
      if (goal.matchPercentage.gt(0)) {
        let rawMatch = depositAmount
          .mul(goal.matchPercentage)
          .div(100)
          .toDecimalPlaces(2);

        if (goal.matchMaxAmount) {
          const remainingMatchCap = Prisma.Decimal.max(
            new Prisma.Decimal(0),
            goal.matchMaxAmount.minus(goal.matchedTotalSoFar)
          );
          if (rawMatch.gt(remainingMatchCap)) {
            rawMatch = remainingMatchCap;
          }
        }

        if (rawMatch.gt(0)) {
          const familyRows = await tx.$queryRaw<
            Array<{ id: string; unallocatedBudget: Prisma.Decimal }>
          >`SELECT "id", "unallocatedBudget" FROM "Family" WHERE "id" = ${child.familyId} FOR UPDATE`;

          const lockedFamily = familyRows[0];
          const availableFamilyBudget = lockedFamily
            ? new Prisma.Decimal(lockedFamily.unallocatedBudget)
            : new Prisma.Decimal(0);

          if (availableFamilyBudget.gte(rawMatch)) {
            matchApplied = rawMatch;

            await tx.family.update({
              where: { id: child.familyId },
              data: {
                unallocatedBudget: { decrement: matchApplied },
              },
            });

            await tx.ledgerEntry.create({
              data: {
                familyId: child.familyId,
                childId: child.id,
                walletBucket: "FAMILY_BUDGET",
                amount: matchApplied,
                direction: "DEBIT",
                type: "GOAL_MATCH",
                status: "COMPLETED",
                idempotencyKey: `${idempotencyKey}:parent-match`,
                referenceId: goal.id,
                description: `${goal.matchPercentage.toFixed(0)}% parent savings match on "${goal.name}"`,
              },
            });
          }
        }
      }

      // 4. Credit Goal Balance and check completion (FR-6.5)
      const totalAddedToGoal = depositAmount.plus(matchApplied);
      const nextGoalAmount = goal.currentAmount.plus(totalAddedToGoal);
      const reachedGoal =
        goal.status !== "COMPLETED" && nextGoalAmount.gte(goal.targetAmount);

      const updatedGoal = await tx.savingsGoal.update({
        where: { id: goal.id },
        data: {
          currentAmount: nextGoalAmount,
          matchedTotalSoFar: { increment: matchApplied },
          ...(reachedGoal
            ? { status: "COMPLETED", completedAt: new Date() }
            : {}),
        },
      });

      await writeAuditLog(
        {
          familyId: child.familyId,
          actorUserId: isParent ? session.sub : null,
          actorChildId: !isParent ? session.sub : null,
          actorRole: session.role,
          action: "SAVINGS_GOAL_DEPOSIT",
          targetType: "SavingsGoal",
          targetId: goal.id,
          details: {
            depositAmount: depositAmount.toString(),
            matchApplied: matchApplied.toString(),
            newGoalAmount: updatedGoal.currentAmount.toString(),
            reachedGoal,
          },
          ipAddress,
          userAgent,
        },
        tx
      );

      return { updatedWallet, updatedGoal, matchApplied, reachedGoal };
    });

    // Trigger celebration & Money Moment notifications (FR-6.5, FR-9.3)
    if (txResult.reachedGoal) {
      await prisma.notification.createMany({
        data: [
          {
            familyId: child.familyId,
            childId: child.id,
            type: "SAVINGS_GOAL_REACHED",
            title: `Goal Reached: ${goal.name}!`,
            message: `Celebration time! You hit your $${goal.targetAmount.toFixed(2)} savings goal for "${goal.name}"!`,
            metadata: {
              goalId: goal.id,
              celebrationAnimation: "CONFETTI_TROPHY",
            },
            channel: "IN_APP",
          },
          {
            familyId: child.familyId,
            type: "CHILD_GOAL_REACHED_PARENT",
            title: `${child.name} Reached a Savings Goal!`,
            message: `${child.name} just completed their "${goal.name}" goal ($${txResult.updatedGoal.currentAmount.toFixed(2)})!`,
            metadata: { goalId: goal.id, childId: child.id },
            channel: "IN_APP",
          },
        ],
      });
    }

    const projection = await computeGoalProjection(txResult.updatedGoal);

    return apiSuccess(
      {
        goal: {
          ...txResult.updatedGoal,
          targetAmount: txResult.updatedGoal.targetAmount.toString(),
          currentAmount: txResult.updatedGoal.currentAmount.toString(),
          matchPercentage: txResult.updatedGoal.matchPercentage.toString(),
          matchedTotalSoFar: txResult.updatedGoal.matchedTotalSoFar.toString(),
        },
        depositAmount: depositAmount.toString(),
        parentMatchAdded: txResult.matchApplied.toString(),
        celebrationTriggered: txResult.reachedGoal,
        celebrationAnimation: txResult.reachedGoal ? "CONFETTI_TROPHY" : null,
        wallet: {
          spendBalance: txResult.updatedWallet.spendBalance.toString(),
          saveBalance: txResult.updatedWallet.saveBalance.toString(),
          giveBalance: txResult.updatedWallet.giveBalance.toString(),
        },
        projection,
      },
      200,
      txResult.reachedGoal
        ? `Congratulations! You reached your "${goal.name}" goal!`
        : txResult.matchApplied.gt(0)
          ? `Deposited $${depositAmount.toFixed(2)} + $${txResult.matchApplied.toFixed(2)} parent match!`
          : `Deposited $${depositAmount.toFixed(2)} into "${goal.name}"`
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
