import { NextRequest } from "next/server";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireParent } from "@/lib/auth-guard";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { verifyParentPin } from "@/lib/parent-pin";
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user, family } = await requireParent(req, "canManageChildren");
    // Activation also edits limits; limited co-parents need both permissions.
    await requireParent(req, "canManageSpendingRules");
    const input = await validateBody(
      req,
      z.object({
        parentPin: z.string().regex(/^\d{6}$/),
        dailyLimit: z.number().min(0).max(10000),
        weeklyLimit: z.number().positive().max(25000).nullable(),
        maxPerTransaction: z.number().positive().max(10000).nullable(),
        inStoreEnabled: z.boolean(),
        onlineEnabled: z.boolean(),
        ageBlockEnabled: z.boolean(),
      }),
    );
    await verifyParentPin(user.id, input.parentPin);
    const payer = await prisma.user.findFirst({
      where: { familyId: family.id, role: "PRIMARY_PARENT" },
      select: { paypalVaultId: true },
    });
    if (!payer?.paypalVaultId)
      throw new ApiError(
        409,
        "The primary parent needs to save a PayPal wallet before activation.",
        "PAYPAL_WALLET_REQUIRED",
      );
    const { id } = await context.params;
    const pin = String(randomInt(100000, 1000000));
    const pinHash = await bcrypt.hash(pin, 12);
    const child = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Child" WHERE "id" = ${id} FOR UPDATE`;
      const current = await tx.child.findUnique({ where: { id } });
      if (!current || current.familyId !== family.id)
        throw new ApiError(404, "Child not found.");
      if (current.pinHash)
        throw new ApiError(
          409,
          "This child is already active. Use Manage to change their controls or reset their PIN.",
          "CHILD_ALREADY_ACTIVE",
        );
      const { parentPin: _pin, ...rule } = input;
      await tx.spendingRule.upsert({
        where: { childId: id },
        create: {
          childId: id,
          ...rule,
          autoApproveCategories: [],
          safeListMerchants: [],
          requireApprovalCategories: [],
        },
        update: rule,
      });
      await tx.auditLog.create({
        data: {
          familyId: family.id,
          actorUserId: user.id,
          actorRole: user.role,
          action: "CHILD_ACTIVATED",
          targetType: "Child",
          targetId: id,
        },
      });
      return tx.child.update({
        where: { id },
        data: { pinHash, failedPinAttempts: 0, pinLockedUntil: null },
      });
    });
    return apiSuccess(
      { username: child.username, pin, childId: child.id },
      201,
    );
  } catch (e) {
    return handleRouteError(e);
  }
}
