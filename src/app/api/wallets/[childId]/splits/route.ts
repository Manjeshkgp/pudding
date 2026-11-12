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

const updateSplitsSchema = z
  .object({
    defaultSplitSpend: z.number().int().min(0).max(100),
    defaultSplitSave: z.number().int().min(0).max(100),
  })
  .refine((data) => data.defaultSplitSpend + data.defaultSplitSave === 100, {
    message: "Spend and Save split percentages must add up to exactly 100%",
    path: ["defaultSplitSpend"],
  });

/**
 * PUT /api/wallets/[childId]/splits
 * Parent sets the default Spend and Save split percentages for a child's wallet (FR-3.1).
 */
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ childId: string }> },
) {
  try {
    const { childId } = await context.params;
    const { user, family } = await requireParent(req, "canManageAllowances");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, updateSplitsSchema);

    const child = await prisma.child.findUnique({
      where: { id: childId },
      include: { wallet: true },
    });

    if (!child || child.familyId !== family.id || !child.wallet) {
      throw new ApiError(404, "Child wallet not found", "WALLET_NOT_FOUND");
    }

    const updatedWallet = await prisma.wallet.update({
      where: { id: child.wallet.id },
      data: {
        defaultSplitSpend: input.defaultSplitSpend,
        defaultSplitSave: input.defaultSplitSave,
      },
    });

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: "CHILD_WALLET_SPLITS_UPDATED",
      targetType: "Wallet",
      targetId: updatedWallet.id,
      details: {
        childId: child.id,
        defaultSplitSpend: updatedWallet.defaultSplitSpend,
        defaultSplitSave: updatedWallet.defaultSplitSave,
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      {
        childId: child.id,
        defaultSplitSpend: updatedWallet.defaultSplitSpend,
        defaultSplitSave: updatedWallet.defaultSplitSave,
      },
      200,
      "Default Spend and Save split percentages updated",
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
