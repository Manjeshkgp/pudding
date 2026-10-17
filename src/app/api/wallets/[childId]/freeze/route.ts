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

const freezeWalletSchema = z.object({
  isFrozen: z.boolean(),
  freezeChildLoginToo: z.boolean().optional().default(false),
  reason: z.string().trim().max(200).optional(),
});

/**
 * POST /api/wallets/[childId]/freeze
 * Parent instantly freezes or unfreezes a child's wallet / spending (FR-7.6, FR-10.5).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ childId: string }> }
) {
  try {
    const { childId } = await context.params;
    const { user, family } = await requireParent(req);
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, freezeWalletSchema);

    const child = await prisma.child.findUnique({
      where: { id: childId },
      include: { wallet: true },
    });

    if (!child || child.familyId !== family.id || !child.wallet) {
      throw new ApiError(404, "Child wallet not found", "WALLET_NOT_FOUND");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.update({
        where: { id: child.wallet!.id },
        data: { isFrozen: input.isFrozen },
      });

      if (input.freezeChildLoginToo || !input.isFrozen) {
        await tx.child.update({
          where: { id: child.id },
          data: {
            isFrozen: input.isFrozen ? input.freezeChildLoginToo : false,
          },
        });
      }

      await writeAuditLog(
        {
          familyId: family.id,
          actorUserId: user.id,
          actorRole: user.role,
          action: input.isFrozen
            ? "CHILD_WALLET_FROZEN"
            : "CHILD_WALLET_UNFROZEN",
          targetType: "Wallet",
          targetId: wallet.id,
          details: {
            childId: child.id,
            isFrozen: input.isFrozen,
            freezeChildLoginToo: input.freezeChildLoginToo,
            reason: input.reason,
          },
          ipAddress,
          userAgent,
        },
        tx
      );

      return wallet;
    });

    return apiSuccess(
      {
        childId: child.id,
        walletId: updated.id,
        isFrozen: updated.isFrozen,
      },
      200,
      input.isFrozen
        ? `${child.name}'s spending wallet has been frozen`
        : `${child.name}'s spending wallet has been unfrozen`
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
