import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireParent } from "@/lib/auth-guard";
import { hasParentPermission } from "@/lib/co-parent-permissions";
import { verifyParentPin } from "@/lib/parent-pin";
import { canReviewPurchase } from "@/lib/purchase-review";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import {
  payPurchase,
  serializePurchase,
  notifyPurchase,
} from "@/services/purchase.service";
export const maxDuration = 60;
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user, family } = await requireParent(req, "canApproveSpending");
    const { id } = await context.params;
    const input = await validateBody(
      req,
      z.object({
        action: z.enum(["APPROVE", "DECLINE"]),
        pin: z
          .string()
          .regex(/^\d{6}$/)
          .optional(),
        reason: z.string().trim().max(300).optional(),
        confirmedAllowance: z
          .string()
          .regex(/^\d{1,10}\.\d{2}$/)
          .optional(),
      }),
    );
    if (input.action === "APPROVE") {
      const purchase = await prisma.purchase.findFirst({
        where: { id, familyId: family.id },
        select: { id: true },
      });
      if (!purchase) throw new ApiError(404, "Purchase not found.");
      if (!input.pin)
        throw new ApiError(
          400,
          "Enter your parent PIN to approve this purchase.",
          "PIN_REQUIRED",
        );
      await verifyParentPin(user.id, input.pin);
      try {
        const paid = await payPurchase(id, user.id, {
          familyId: family.id,
          actorRole: user.role,
          canAllocate: hasParentPermission(user, "canManageBudget"),
          confirmedAllowance: input.confirmedAllowance,
          note: input.reason,
        });
        return apiSuccess({ purchase: serializePurchase(paid) });
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.code === "ALLOWANCE_CONFIRMATION_REQUIRED"
        )
          return apiSuccess({ allowanceConfirmation: error.details });
        throw error;
      }
    }
    const p = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Purchase" WHERE "id" = ${id} FOR UPDATE`;
      const purchase = await tx.purchase.findUnique({ where: { id } });
      if (!purchase || purchase.familyId !== family.id)
        throw new ApiError(404, "Purchase not found.");
      if (!canReviewPurchase(purchase.status))
        throw new ApiError(
          409,
          "This purchase is not waiting for a parent decision.",
        );
      const updated = await tx.purchase.update({
        where: { id },
        data: {
          status: "DECLINED",
          reviewedByUserId: user.id,
          decisionReason: input.reason || "Your parent declined this purchase.",
        },
      });
      await tx.auditLog.create({
        data: {
          familyId: family.id,
          actorUserId: user.id,
          actorRole: user.role,
          action: "PURCHASE_DECLINE",
          targetType: "Purchase",
          targetId: id,
          details: { reviewReason: purchase.decisionReason },
        },
      });
      return updated;
    });
    await notifyPurchase(
      p,
      "Purchase declined",
      p.decisionReason || "Declined by parent.",
    );
    return apiSuccess({ purchase: serializePurchase(p) });
  } catch (e) {
    return handleRouteError(e);
  }
}
