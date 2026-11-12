import { Prisma } from "@prisma/client";

export function startOfPurchaseWeek(now: Date) {
  const week = new Date(now);
  week.setUTCHours(0, 0, 0, 0);
  week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
  return week;
}

export async function purchaseUsage(
  db: Pick<Prisma.TransactionClient, "purchase">,
  childId: string,
  since: Date,
  excludePurchaseId?: string,
) {
  const usage = await db.purchase.aggregate({
    where: {
      childId,
      ...(excludePurchaseId ? { id: { not: excludePurchaseId } } : {}),
      OR: [
        { status: "PAID", paidAt: { gte: since } },
        { status: "PROCESSING" },
      ],
    },
    _sum: { amount: true },
  });
  return usage._sum.amount ?? new Prisma.Decimal(0);
}
