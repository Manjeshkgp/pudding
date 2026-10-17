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
import { computeGoalProjection } from "@/services/goals.service";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const updateGoalSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  targetAmount: z.number().positive().max(50000).optional(),
  imageUrl: z.string().url().nullable().optional(),
  deadline: z.string().datetime().nullable().optional(),
  isLocked: z.boolean().optional(),
  unlockApprovedByParent: z.boolean().optional(),
});

/**
 * GET /api/goals/[id]
 * Retrieves a single savings goal with its projection metrics and related ledger history.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const goal = await prisma.savingsGoal.findUnique({
      where: { id },
    });

    if (!goal) {
      throw new ApiError(404, "Savings goal not found", "GOAL_NOT_FOUND");
    }

    await requireChildOrFamilyParent(req, goal.childId);

    const [projection, history] = await Promise.all([
      computeGoalProjection(goal),
      prisma.ledgerEntry.findMany({
        where: {
          childId: goal.childId,
          referenceId: goal.id,
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);

    return apiSuccess({
      ...goal,
      targetAmount: goal.targetAmount.toString(),
      currentAmount: goal.currentAmount.toString(),
      matchPercentage: goal.matchPercentage.toString(),
      matchMaxAmount: goal.matchMaxAmount?.toString() ?? null,
      matchedTotalSoFar: goal.matchedTotalSoFar.toString(),
      interestRateApr: goal.interestRateApr.toString(),
      projection,
      history: history.map((h) => ({
        ...h,
        amount: h.amount.toString(),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PATCH /api/goals/[id]
 * Updates goal metadata. Only parents can change `isLocked` or `unlockApprovedByParent` (FR-6.6).
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const goal = await prisma.savingsGoal.findUnique({
      where: { id },
    });

    if (!goal) {
      throw new ApiError(404, "Savings goal not found", "GOAL_NOT_FOUND");
    }

    const { session, child, isParent } = await requireChildOrFamilyParent(
      req,
      goal.childId
    );
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, updateGoalSchema);

    if (
      !isParent &&
      (input.isLocked !== undefined ||
        input.unlockApprovedByParent !== undefined)
    ) {
      throw new ApiError(
        403,
        "Only a parent can lock or approve unlocking a savings goal (FR-6.6)",
        "PARENT_REQUIRED"
      );
    }

    const updated = await prisma.savingsGoal.update({
      where: { id: goal.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.targetAmount !== undefined
          ? { targetAmount: input.targetAmount }
          : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.deadline !== undefined
          ? { deadline: input.deadline ? new Date(input.deadline) : null }
          : {}),
        ...(isParent && input.isLocked !== undefined
          ? { isLocked: input.isLocked }
          : {}),
        ...(isParent && input.unlockApprovedByParent !== undefined
          ? { unlockApprovedByParent: input.unlockApprovedByParent }
          : {}),
      },
    });

    await writeAuditLog({
      familyId: child.familyId,
      actorUserId: isParent ? session.sub : null,
      actorChildId: !isParent ? session.sub : null,
      actorRole: session.role,
      action: "SAVINGS_GOAL_UPDATED",
      targetType: "SavingsGoal",
      targetId: updated.id,
      details: input as Record<string, unknown>,
      ipAddress,
      userAgent,
    });

    const projection = await computeGoalProjection(updated);

    return apiSuccess(
      {
        ...updated,
        targetAmount: updated.targetAmount.toString(),
        currentAmount: updated.currentAmount.toString(),
        matchPercentage: updated.matchPercentage.toString(),
        matchMaxAmount: updated.matchMaxAmount?.toString() ?? null,
        matchedTotalSoFar: updated.matchedTotalSoFar.toString(),
        interestRateApr: updated.interestRateApr.toString(),
        projection,
      },
      200,
      "Savings goal updated"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * DELETE /api/goals/[id]
 * Cancels/deletes a goal and returns any saved balance back to the child's SAVE bucket.
 * If the goal is locked by a parent, a child cannot delete it without parent unlock approval (FR-6.6).
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const goal = await prisma.savingsGoal.findUnique({
      where: { id },
    });

    if (!goal) {
      throw new ApiError(404, "Savings goal not found", "GOAL_NOT_FOUND");
    }

    const { session, child, isParent } = await requireChildOrFamilyParent(
      req,
      goal.childId
    );
    const { ipAddress, userAgent } = getRequestMeta(req);

    if (!isParent && goal.isLocked && !goal.unlockApprovedByParent) {
      throw new ApiError(
        403,
        "This goal is locked until your parent approves withdrawal (FR-6.6)",
        "GOAL_LOCKED"
      );
    }

    await prisma.$transaction(async (tx) => {
      if (goal.currentAmount.gt(new Prisma.Decimal(0))) {
        await tx.wallet.update({
          where: { childId: child.id },
          data: {
            saveBalance: { increment: goal.currentAmount },
          },
        });

        await tx.ledgerEntry.create({
          data: {
            familyId: child.familyId,
            childId: child.id,
            walletBucket: "SAVE",
            amount: goal.currentAmount,
            direction: "CREDIT",
            type: "GOAL_WITHDRAWAL",
            status: "COMPLETED",
            idempotencyKey: `goal-delete-return:${goal.id}:${Date.now()}`,
            referenceId: goal.id,
            actorUserId: isParent ? session.sub : null,
            actorChildId: !isParent ? session.sub : null,
            description: `Returned $${goal.currentAmount.toFixed(2)} from closed goal "${goal.name}" to SAVE bucket`,
          },
        });
      }

      await writeAuditLog(
        {
          familyId: child.familyId,
          actorUserId: isParent ? session.sub : null,
          actorChildId: !isParent ? session.sub : null,
          actorRole: session.role,
          action: "SAVINGS_GOAL_DELETED",
          targetType: "SavingsGoal",
          targetId: goal.id,
          details: {
            goalName: goal.name,
            returnedAmount: goal.currentAmount.toString(),
          },
          ipAddress,
          userAgent,
        },
        tx
      );

      await tx.savingsGoal.delete({
        where: { id: goal.id },
      });
    });

    return apiSuccess(
      { deletedGoalId: goal.id, returnedToSaveBucket: goal.currentAmount.toString() },
      200,
      "Savings goal deleted and balance returned to Save bucket"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
