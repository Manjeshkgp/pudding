import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
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
const schema = z.object({
  amount: z.number().positive().max(50000).multipleOf(0.01),
  pin: z.string().regex(/^\d{6}$/),
  idempotencyKey: z.string().min(8).max(128),
});
export async function GET(req: NextRequest) {
  try {
    const { family } = await requireParent(req);
    return apiSuccess({
      limit: family.spendingLimit.toString(),
      spent: family.spentTotal.toString(),
      reserved: family.reservedTotal.toString(),
      available: Prisma.Decimal.max(
        0,
        family.spendingLimit
          .minus(family.spentTotal)
          .minus(family.reservedTotal),
      ).toString(),
      currency: family.currency,
      topUps: await prisma.familyTopUp.findMany({
        where: { familyId: family.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const { user, family } = await requireParent(req, "canManageBudget");
    const input = await validateBody(req, schema);
    await verifyParentPin(user.id, input.pin);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Family" WHERE "id" = ${family.id} FOR UPDATE`;
      const existing = await tx.familyTopUp.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (
          existing.familyId !== family.id ||
          !existing.amount.equals(input.amount)
        )
          throw new ApiError(
            409,
            "This request key belongs to a different top-up.",
            "IDEMPOTENCY_CONFLICT",
          );
        return { topUp: existing, replay: true };
      }
      const amount = new Prisma.Decimal(input.amount);
      const topUp = await tx.familyTopUp.create({
        data: {
          familyId: family.id,
          actorUserId: user.id,
          amount,
          idempotencyKey: input.idempotencyKey,
        },
      });
      // Both are internal authorization figures; no PayPal call or deposit.
      await tx.family.update({
        where: { id: family.id },
        data: {
          spendingLimit: { increment: amount },
          unallocatedBudget: { increment: amount },
        },
      });
      await tx.ledgerEntry.create({
        data: {
          familyId: family.id,
          walletBucket: "FAMILY_BUDGET",
          type: "BUDGET_ADD",
          direction: "CREDIT",
          amount,
          actorUserId: user.id,
          idempotencyKey: `topup:${topUp.id}`,
          description: "Family spending limit increased (no money transferred)",
        },
      });
      await tx.auditLog.create({
        data: {
          familyId: family.id,
          actorUserId: user.id,
          actorRole: user.role,
          action: "FAMILY_LIMIT_INCREASED",
          targetType: "FamilyTopUp",
          targetId: topUp.id,
          details: { amount: amount.toString() },
        },
      });
      return { topUp, replay: false };
    });
    return apiSuccess(result, result.replay ? 200 : 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
