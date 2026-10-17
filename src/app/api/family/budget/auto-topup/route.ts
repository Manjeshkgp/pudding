import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const autoTopUpSchema = z.object({
  enabled: z.boolean(),
  autoTopUpAmount: z.number().positive().max(10000).nullable().optional(),
  autoTopUpThreshold: z.number().min(0).max(10000).nullable().optional(),
  autoTopUpSchedule: z
    .enum(["ON_THRESHOLD", "WEEKLY", "MONTHLY"])
    .nullable()
    .optional(),
});

/**
 * PUT /api/family/budget/auto-topup
 * Configures optional virtual budget auto top-up when family balance falls below a parent-set threshold (FR-2.7).
 */
export async function PUT(req: NextRequest) {
  try {
    const { user, family } = await requireParent(req, "canManageBudget");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, autoTopUpSchema);

    const updatedFamily = await prisma.family.update({
      where: { id: family.id },
      data: {
        autoTopUpAmount: input.enabled ? (input.autoTopUpAmount ?? 100) : null,
        autoTopUpThreshold: input.enabled
          ? (input.autoTopUpThreshold ?? 20)
          : null,
        autoTopUpSchedule: input.enabled
          ? (input.autoTopUpSchedule ?? "ON_THRESHOLD")
          : null,
      },
    });

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: "FAMILY_AUTO_TOPUP_UPDATED",
      targetType: "Family",
      targetId: family.id,
      details: {
        enabled: input.enabled,
        autoTopUpAmount: updatedFamily.autoTopUpAmount?.toString() ?? null,
        autoTopUpThreshold:
          updatedFamily.autoTopUpThreshold?.toString() ?? null,
        autoTopUpSchedule: updatedFamily.autoTopUpSchedule,
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      {
        enabled: Boolean(updatedFamily.autoTopUpAmount),
        autoTopUpAmount: updatedFamily.autoTopUpAmount?.toString() ?? null,
        autoTopUpThreshold:
          updatedFamily.autoTopUpThreshold?.toString() ?? null,
        autoTopUpSchedule: updatedFamily.autoTopUpSchedule,
      },
      200,
      input.enabled
        ? "Virtual budget auto top-up enabled"
        : "Virtual budget auto top-up disabled"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
