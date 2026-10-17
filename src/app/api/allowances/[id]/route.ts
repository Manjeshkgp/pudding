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
import { computeNextAllowanceRunAt } from "@/jobs/allowance.job";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const updateAllowanceSchema = z.object({
  amount: z.number().positive().max(5000).optional(),
  frequency: z
    .enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "CUSTOM_DAY"])
    .optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
  requireAllChores: z.boolean().optional(),
  reduceByMissedChores: z.boolean().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]).optional(),
  nextRunAt: z.string().datetime().optional(),
});

/**
 * PATCH /api/allowances/[id]
 * Parent can pause, resume, edit, or cancel an allowance rule at any time (FR-4.4).
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, family } = await requireParent(req, "canManageAllowances");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, updateAllowanceSchema);

    const existing = await prisma.allowanceRule.findUnique({
      where: { id },
      include: { child: true },
    });

    if (!existing || existing.child.familyId !== family.id) {
      throw new ApiError(404, "Allowance rule not found", "ALLOWANCE_NOT_FOUND");
    }

    const nextFrequency = input.frequency ?? existing.frequency;
    const nextDayOfWeek =
      input.dayOfWeek !== undefined ? input.dayOfWeek : existing.dayOfWeek;
    const nextDayOfMonth =
      input.dayOfMonth !== undefined ? input.dayOfMonth : existing.dayOfMonth;

    const recomputedNextRunAt = input.nextRunAt
      ? new Date(input.nextRunAt)
      : input.frequency !== undefined ||
          input.dayOfWeek !== undefined ||
          input.dayOfMonth !== undefined
        ? computeNextAllowanceRunAt(
            nextFrequency,
            nextDayOfWeek,
            nextDayOfMonth
          )
        : existing.nextRunAt;

    const updated = await prisma.allowanceRule.update({
      where: { id: existing.id },
      data: {
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.frequency !== undefined
          ? { frequency: input.frequency }
          : {}),
        ...(input.dayOfWeek !== undefined
          ? { dayOfWeek: input.dayOfWeek }
          : {}),
        ...(input.dayOfMonth !== undefined
          ? { dayOfMonth: input.dayOfMonth }
          : {}),
        ...(input.requireAllChores !== undefined
          ? { requireAllChores: input.requireAllChores }
          : {}),
        ...(input.reduceByMissedChores !== undefined
          ? { reduceByMissedChores: input.reduceByMissedChores }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        nextRunAt: recomputedNextRunAt,
      },
    });

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: "ALLOWANCE_RULE_UPDATED",
      targetType: "AllowanceRule",
      targetId: updated.id,
      details: input as Record<string, unknown>,
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      {
        ...updated,
        amount: updated.amount.toString(),
      },
      200,
      "Allowance rule updated"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * DELETE /api/allowances/[id]
 * Cancels an allowance rule (FR-4.4).
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, family } = await requireParent(req, "canManageAllowances");
    const { ipAddress, userAgent } = getRequestMeta(req);

    const existing = await prisma.allowanceRule.findUnique({
      where: { id },
      include: { child: true },
    });

    if (!existing || existing.child.familyId !== family.id) {
      throw new ApiError(404, "Allowance rule not found", "ALLOWANCE_NOT_FOUND");
    }

    const cancelled = await prisma.allowanceRule.update({
      where: { id: existing.id },
      data: { status: "CANCELLED" },
    });

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: "ALLOWANCE_RULE_CANCELLED",
      targetType: "AllowanceRule",
      targetId: cancelled.id,
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      { id: cancelled.id, status: cancelled.status },
      200,
      "Allowance rule cancelled"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
