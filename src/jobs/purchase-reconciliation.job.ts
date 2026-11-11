import prisma from "@/lib/prisma";
import { reconcilePurchase } from "@/services/purchase.service";
import { logger } from "@/lib/logger";
export async function reconcilePendingPurchases(familyId?: string) {
  const pending = await prisma.purchase.findMany({
    where: {
      ...(familyId ? { familyId } : {}),
      status: "PROCESSING",
      paypalOrderId: { not: null },
      updatedAt: { lt: new Date(Date.now() - 30000) },
    },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  let completed = 0,
    waiting = 0;
  for (const purchase of pending) {
    try {
      const result = await reconcilePurchase(purchase.id);
      if (result.status === "PAID") completed++;
      else waiting++;
    } catch (error) {
      waiting++;
      logger.warn(
        "purchase.reconciliation_waiting",
        {
          requestId: purchase.id,
          job: "purchase_reconciliation",
          retryable: true,
        },
        error,
      );
    }
  }
  return { checked: pending.length, completed, waiting };
}
