import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";

export function oldestParentApproval(
  familyId: string,
  db: Pick<Prisma.TransactionClient, "purchase"> = prisma,
) {
  return db.purchase.findFirst({
    where: {
      familyId,
      OR: [
        { status: { in: ["WAITING_PARENT", "AI_BLOCKED", "PAYMENT_FAILED"] } },
        { status: "PROCESSING", reviewedByUserId: { not: null } },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, status: true },
  });
}

/** Call under the family lock so approval and decline use the same ordering. */
export async function requireOldestParentApproval(
  familyId: string,
  purchaseId: string,
  db: Pick<Prisma.TransactionClient, "purchase">,
) {
  const oldest = await oldestParentApproval(familyId, db);
  if (oldest && oldest.id !== purchaseId)
    throw new ApiError(409, "Review the oldest purchase request first.", "OLDER_PURCHASE_PENDING");
}

export function markPurchaseNotificationsReviewed(
  db: Pick<Prisma.TransactionClient, "notification">,
  familyId: string,
  purchaseId: string,
) {
  return db.notification.updateMany({
    where: {
      familyId,
      childId: null,
      isRead: false,
      type: "PURCHASE_UPDATE",
      metadata: { path: ["purchaseId"], equals: purchaseId },
    },
    data: { isRead: true },
  });
}
