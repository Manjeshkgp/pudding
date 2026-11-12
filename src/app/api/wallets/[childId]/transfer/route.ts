import { notifyWithPush } from "@/services/notification.service";
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
import { transferFromFamilyToChild } from "@/services/ledger.service";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const transferSchema = z.object({
  mode: z.literal("FAMILY_TO_CHILD"),
  amount: z.number().positive("Amount must be greater than 0").max(10000),
  targetBucket: z.enum(["DEFAULT_SPLIT", "SPEND", "SAVE"]).default("DEFAULT_SPLIT"),
  description: z.string().trim().max(200).optional(),
  idempotencyKey: z.string().trim().min(4).max(128).optional(),
});

/** Parent allocation from the family budget to a child's wallet. */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ childId: string }> },
) {
  try {
    const { childId } = await context.params;
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, transferSchema);
    const headerIdempotencyKey = req.headers.get("x-idempotency-key");

    const { user, family } = await requireParent(req, "canManageBudget");

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

    const idempotencyKey =
      input.idempotencyKey ||
      headerIdempotencyKey ||
      `instant-transfer:${family.id}:${child.id}:${Date.now()}`;

    const result = await transferFromFamilyToChild({
      familyId: family.id,
      childId: child.id,
      amount: input.amount,
      idempotencyKey,
      entryType: "INSTANT_TRANSFER",
      targetBucket: input.targetBucket,
      actorUserId: user.id,
      description:
        input.description ||
        `Instant transfer from ${user.name} to ${child.name}`,
    });

    if (!result.idempotentReplay) {
      await notifyWithPushRecord({
        data: {
          familyId: family.id,
          childId: child.id,
          type: "INSTANT_TRANSFER_RECEIVED",
          title: "You got money!",
          message: `${user.name} sent $${input.amount.toFixed(2)} to your wallet!`,
          channel: "IN_APP",
        },
      });

      await writeAuditLog({
        familyId: family.id,
        actorUserId: user.id,
        actorRole: user.role,
        action: "FAMILY_TO_CHILD_INSTANT_TRANSFER",
        targetType: "Wallet",
        targetId: result.wallet.id,
        details: {
          childId: child.id,
          amount: input.amount,
          targetBucket: input.targetBucket,
        },
        ipAddress,
        userAgent,
      });
    }

    return apiSuccess(
      {
        familyUnallocatedBudget: result.family.unallocatedBudget.toString(),
        wallet: {
          id: result.wallet.id,
          spendBalance: result.wallet.spendBalance.toString(),
          saveBalance: result.wallet.saveBalance.toString(),
        },
        idempotentReplay: result.idempotentReplay,
      },
      200,
      `Transferred $${input.amount.toFixed(2)} to ${child.name}'s wallet`,
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

async function notifyWithPushRecord(
  input: Parameters<typeof prisma.notification.create>[0],
) {
  return notifyWithPush(
    input.data as import("@prisma/client").Prisma.NotificationUncheckedCreateInput,
  );
}
