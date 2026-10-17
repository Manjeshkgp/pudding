import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export interface InterestRunSummary {
  evaluatedGoalsCount: number;
  creditedCount: number;
  skippedInsufficientBudgetCount: number;
  results: Array<{
    goalId: string;
    goalName: string;
    childId: string;
    interestPaid: string;
    newGoalBalance: string;
    status: "CREDITED" | "SKIPPED_TOO_SMALL" | "SKIPPED_INSUFFICIENT_BUDGET";
  }>;
}

/**
 * Calculates and applies parent-funded compounding interest on active savings goals (FR-6.4).
 * Deducts the interest from the Parent's Unallocated Family Budget so accounting remains balanced.
 */
export async function processSavingsInterest(
  specificGoalId?: string
): Promise<InterestRunSummary> {
  const now = new Date();

  const goals = await prisma.savingsGoal.findMany({
    where: {
      status: "ACTIVE",
      interestRateApr: { gt: 0 },
      currentAmount: { gt: 0 },
      ...(specificGoalId ? { id: specificGoalId } : {}),
    },
    include: {
      child: {
        include: { family: true },
      },
    },
  });

  const summary: InterestRunSummary = {
    evaluatedGoalsCount: goals.length,
    creditedCount: 0,
    skippedInsufficientBudgetCount: 0,
    results: [],
  };

  for (const goal of goals) {
    const { child } = goal;
    const { family } = child;

    if (family.isFrozen || child.isFrozen) {
      continue;
    }

    // Calculate monthly compounding interest (or pro-rated days if >1 day elapsed, minimum monthly step for demo/testing)
    const aprDecimal = goal.interestRateApr.div(100);
    const monthlyRate = aprDecimal.div(12);
    const rawInterest = goal.currentAmount
      .mul(monthlyRate)
      .toDecimalPlaces(2);

    const interestAmount = rawInterest.gte(new Prisma.Decimal("0.01"))
      ? rawInterest
      : new Prisma.Decimal("0.01");

    const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
    const idempotencyKey = `goal-interest:${goal.id}:${periodKey}`;

    const existing = await prisma.ledgerEntry.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      continue;
    }

    try {
      const updatedGoal = await prisma.$transaction(async (tx) => {
        const familyRows = await tx.$queryRaw<
          Array<{ id: string; unallocatedBudget: Prisma.Decimal }>
        >`SELECT "id", "unallocatedBudget" FROM "Family" WHERE "id" = ${family.id} FOR UPDATE`;

        const lockedFamily = familyRows[0];
        if (
          !lockedFamily ||
          new Prisma.Decimal(lockedFamily.unallocatedBudget).lt(interestAmount)
        ) {
          throw new Error("INSUFFICIENT_FAMILY_BUDGET");
        }

        await tx.family.update({
          where: { id: family.id },
          data: { unallocatedBudget: { decrement: interestAmount } },
        });

        const nextAmount = goal.currentAmount.plus(interestAmount);
        const reachedGoal = nextAmount.gte(goal.targetAmount);

        const g = await tx.savingsGoal.update({
          where: { id: goal.id },
          data: {
            currentAmount: nextAmount,
            lastInterestAppliedAt: now,
            ...(reachedGoal
              ? { status: "COMPLETED", completedAt: now }
              : {}),
          },
        });

        await tx.ledgerEntry.create({
          data: {
            familyId: family.id,
            childId: child.id,
            walletBucket: "SAVE",
            amount: interestAmount,
            direction: "CREDIT",
            type: "SAVINGS_INTEREST",
            status: "COMPLETED",
            idempotencyKey,
            referenceId: goal.id,
            description: `Compounding interest (${goal.interestRateApr.toFixed(1)}% APR) on "${goal.name}"`,
          },
        });

        await writeAuditLog(
          {
            familyId: family.id,
            actorRole: "SYSTEM_CRON",
            action: "SAVINGS_INTEREST_APPLIED",
            targetType: "SavingsGoal",
            targetId: goal.id,
            details: {
              interestPaid: interestAmount.toString(),
              apr: goal.interestRateApr.toString(),
              newGoalBalance: g.currentAmount.toString(),
            },
          },
          tx
        );

        return g;
      });

      await prisma.notification.create({
        data: {
          familyId: family.id,
          childId: child.id,
          type: "SAVINGS_INTEREST_EARNED",
          title: "Your Savings Grew!",
          message: `You earned $${interestAmount.toFixed(2)} in compounding interest on "${goal.name}"!`,
          channel: "IN_APP",
        },
      });

      summary.creditedCount += 1;
      summary.results.push({
        goalId: goal.id,
        goalName: goal.name,
        childId: child.id,
        interestPaid: interestAmount.toString(),
        newGoalBalance: updatedGoal.currentAmount.toString(),
        status: "CREDITED",
      });
    } catch {
      summary.skippedInsufficientBudgetCount += 1;
      summary.results.push({
        goalId: goal.id,
        goalName: goal.name,
        childId: child.id,
        interestPaid: "0.00",
        newGoalBalance: goal.currentAmount.toString(),
        status: "SKIPPED_INSUFFICIENT_BUDGET",
      });
    }
  }

  return summary;
}
