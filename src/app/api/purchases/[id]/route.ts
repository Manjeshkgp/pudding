import { NextRequest } from "next/server";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
import { purchaseAccess } from "@/lib/purchase-access";
import { hasParentPermission } from "@/lib/co-parent-permissions";
import prisma from "@/lib/prisma";
import { serializePurchase } from "@/services/purchase.service";
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { purchase, parent } = await purchaseAccess(
      req,
      (await context.params).id,
    );
    if (parent) {
      await prisma.notification.updateMany({
        where: {
          familyId: purchase.familyId,
          childId: null,
          isRead: false,
          type: "PURCHASE_UPDATE",
          metadata: { path: ["purchaseId"], equals: purchase.id },
          OR: [{ userId: null }, { userId: parent.user.id }],
        },
        data: { isRead: true },
      });
    }
    const wallet = parent
      ? await prisma.wallet.findUnique({
          where: { childId: purchase.childId },
          select: { spendBalance: true, purchaseReservedBalance: true },
        })
      : null;
    return apiSuccess({
      purchase: { ...serializePurchase(purchase), child: purchase.child },
      ...(parent && {
        review: {
          canApprove: hasParentPermission(parent.user, "canApproveSpending"),
          pinSet: Boolean(parent.user.pinHash),
          availableSpend: wallet
            ? wallet.spendBalance
                .minus(wallet.purchaseReservedBalance)
                .toFixed(2)
            : "0.00",
        },
      }),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
