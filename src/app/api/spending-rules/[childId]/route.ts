import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { requireChildOrFamilyParent, requireParent } from "@/lib/auth-guard";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const updateSpendingRuleSchema = z.object({
  maxPerTransaction: z.number().positive().max(10000).nullable().optional(),
  dailyLimit: z.number().min(0).max(10000).nullable().optional(),
  weeklyLimit: z.number().positive().max(25000).nullable().optional(),
  monthlyLimit: z.number().positive().max(50000).nullable().optional(),
  inStoreEnabled: z.boolean().optional(),
  onlineEnabled: z.boolean().optional(),
  ageBlockEnabled: z.boolean().optional(),
});

/**
 * GET /api/spending-rules/[childId]
 * Retrieves spending limits and controls for a child (FR-7.4, FR-7.5).
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ childId: string }> },
) {
  try {
    const { childId } = await context.params;
    const { child } = await requireChildOrFamilyParent(req, childId);

    let rule = await prisma.spendingRule.findUnique({
      where: { childId: child.id },
    });

    if (!rule) {
      rule = await prisma.spendingRule.create({
        data: {
          childId: child.id,
        },
      });
    }

    return apiSuccess({
      childId: child.id,
      childName: child.name,
      rule: {
        id: rule.id,
        inStoreEnabled: rule.inStoreEnabled,
        onlineEnabled: rule.onlineEnabled,
        ageBlockEnabled: rule.ageBlockEnabled,
        maxPerTransaction: rule.maxPerTransaction?.toString() ?? null,
        dailyLimit: rule.dailyLimit?.toString() ?? null,
        weeklyLimit: rule.weeklyLimit?.toString() ?? null,
        monthlyLimit: rule.monthlyLimit?.toString() ?? null,
        updatedAt: rule.updatedAt,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PUT /api/spending-rules/[childId]
 * Parent configures spending limits and controls.
 */
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ childId: string }> },
) {
  try {
    const { childId } = await context.params;
    const { user, family } = await requireParent(req, "canManageSpendingRules");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, updateSpendingRuleSchema);

    const child = await prisma.child.findUnique({
      where: { id: childId },
    });

    if (!child || child.familyId !== family.id) {
      throw new ApiError(
        404,
        "Child not found in your family",
        "CHILD_NOT_FOUND",
      );
    }

    const updated = await prisma.spendingRule.upsert({
      where: { childId: child.id },
      create: {
        childId: child.id,
        inStoreEnabled: input.inStoreEnabled,
        onlineEnabled: input.onlineEnabled,
        ageBlockEnabled: input.ageBlockEnabled,
        maxPerTransaction: input.maxPerTransaction ?? null,
        dailyLimit: input.dailyLimit ?? null,
        weeklyLimit: input.weeklyLimit ?? null,
        monthlyLimit: input.monthlyLimit ?? null,
      },
      update: {
        inStoreEnabled: input.inStoreEnabled,
        onlineEnabled: input.onlineEnabled,
        ageBlockEnabled: input.ageBlockEnabled,
        ...(input.maxPerTransaction !== undefined
          ? { maxPerTransaction: input.maxPerTransaction }
          : {}),
        ...(input.dailyLimit !== undefined
          ? { dailyLimit: input.dailyLimit }
          : {}),
        ...(input.weeklyLimit !== undefined
          ? { weeklyLimit: input.weeklyLimit }
          : {}),
        ...(input.monthlyLimit !== undefined
          ? { monthlyLimit: input.monthlyLimit }
          : {}),
      },
    });

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: "SPENDING_RULES_UPDATED",
      targetType: "SpendingRule",
      targetId: updated.id,
      details: {
        childId: child.id,
        ...input,
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      {
        childId: child.id,
        rule: {
          id: updated.id,
          maxPerTransaction: updated.maxPerTransaction?.toString() ?? null,
          dailyLimit: updated.dailyLimit?.toString() ?? null,
          weeklyLimit: updated.weeklyLimit?.toString() ?? null,
          monthlyLimit: updated.monthlyLimit?.toString() ?? null,
        },
      },
      200,
      `Spending controls updated for ${child.name}`,
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
