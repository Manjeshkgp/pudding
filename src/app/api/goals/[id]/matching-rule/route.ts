import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const matchingRuleSchema = z.object({
  matchPercentage: z
    .number()
    .min(0, "Match percentage cannot be negative")
    .max(500, "Match percentage cannot exceed 500%"),
  matchMaxAmount: z.number().positive().max(10000).nullable().optional(),
  interestRateApr: z
    .number()
    .min(0, "Interest APR cannot be negative")
    .max(100, "Interest APR cannot exceed 100%")
    .optional(),
  isLocked: z.boolean().optional(),
});

/**
 * PUT /api/goals/[id]/matching-rule
 * Parent sets a savings matching rule (e.g., parent adds 25% on every deposit, FR-6.3),
 * optional parent-funded interest APR (FR-6.4), and goal lock status (FR-6.6).
 */
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, family } = await requireParent(req, "canManageBudget");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, matchingRuleSchema);

    const goal = await prisma.savingsGoal.findUnique({
      where: { id },
      include: { child: true },
    });

    if (!goal || goal.child.familyId !== family.id) {
      throw new ApiError(404, "Savings goal not found", "GOAL_NOT_FOUND");
    }

    const updated = await prisma.savingsGoal.update({
      where: { id: goal.id },
      data: {
        matchPercentage: input.matchPercentage,
        matchMaxAmount:
          input.matchMaxAmount !== undefined
            ? input.matchMaxAmount
            : goal.matchMaxAmount,
        ...(input.interestRateApr !== undefined
          ? { interestRateApr: input.interestRateApr }
          : {}),
        ...(input.isLocked !== undefined ? { isLocked: input.isLocked } : {}),
      },
    });

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: "GOAL_MATCHING_RULE_UPDATED",
      targetType: "SavingsGoal",
      targetId: updated.id,
      details: {
        childId: goal.childId,
        goalName: updated.name,
        matchPercentage: updated.matchPercentage.toString(),
        matchMaxAmount: updated.matchMaxAmount?.toString() ?? null,
        interestRateApr: updated.interestRateApr.toString(),
        isLocked: updated.isLocked,
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      {
        id: updated.id,
        name: updated.name,
        matchPercentage: updated.matchPercentage.toString(),
        matchMaxAmount: updated.matchMaxAmount?.toString() ?? null,
        matchedTotalSoFar: updated.matchedTotalSoFar.toString(),
        interestRateApr: updated.interestRateApr.toString(),
        isLocked: updated.isLocked,
      },
      200,
      "Savings goal matching and interest rules updated"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
