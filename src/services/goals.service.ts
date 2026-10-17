import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export interface GoalMetrics {
  progressPercent: number;
  remainingAmount: string;
  projectedCompletionDate: string | null;
  averageDailySavingRate: string;
}

/**
 * Calculates progress percentage and projected completion date based on the child's
 * saving rate into this goal (or into their Save bucket) (FR-6.2).
 */
export async function computeGoalProjection(goal: {
  id: string;
  childId: string;
  targetAmount: Prisma.Decimal;
  currentAmount: Prisma.Decimal;
  createdAt: Date;
  status: string;
}): Promise<GoalMetrics> {
  const target = new Prisma.Decimal(goal.targetAmount);
  const current = new Prisma.Decimal(goal.currentAmount);

  const rawPercent = target.gt(0)
    ? current.div(target).mul(100).toNumber()
    : 100;
  const progressPercent = Math.min(100, Math.round(rawPercent * 10) / 10);

  const remaining = Prisma.Decimal.max(
    new Prisma.Decimal(0),
    target.minus(current)
  );

  if (remaining.lte(0) || goal.status === "COMPLETED") {
    return {
      progressPercent: 100,
      remainingAmount: "0.00",
      projectedCompletionDate: new Date().toISOString(),
      averageDailySavingRate: "0.00",
    };
  }

  // Calculate daily saving rate since goal creation (minimum 1 day window)
  const now = new Date();
  const elapsedDays = Math.max(
    1,
    (now.getTime() - goal.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  let dailyRate = current.div(elapsedDays);

  // If the goal was just created and has $0, estimate based on recent 30-day SAVE credits + active allowance
  if (dailyRate.lte(0)) {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentSaves = await prisma.ledgerEntry.aggregate({
      where: {
        childId: goal.childId,
        walletBucket: "SAVE",
        direction: "CREDIT",
        status: "COMPLETED",
        createdAt: { gte: thirtyDaysAgo },
      },
      _sum: { amount: true },
    });

    const savedLast30 = recentSaves._sum.amount ?? new Prisma.Decimal(0);
    dailyRate = savedLast30.div(30);
  }

  if (dailyRate.lte(0)) {
    return {
      progressPercent,
      remainingAmount: remaining.toFixed(2),
      projectedCompletionDate: null,
      averageDailySavingRate: "0.00",
    };
  }

  const daysRemaining = Math.ceil(remaining.div(dailyRate).toNumber());
  // Cap projection at 10 years so extreme dates don't overflow
  if (daysRemaining > 3650) {
    return {
      progressPercent,
      remainingAmount: remaining.toFixed(2),
      projectedCompletionDate: null,
      averageDailySavingRate: dailyRate.toFixed(2),
    };
  }

  const projectedDate = new Date(
    now.getTime() + daysRemaining * 24 * 60 * 60 * 1000
  );

  return {
    progressPercent,
    remainingAmount: remaining.toFixed(2),
    projectedCompletionDate: projectedDate.toISOString(),
    averageDailySavingRate: dailyRate.toFixed(2),
  };
}
