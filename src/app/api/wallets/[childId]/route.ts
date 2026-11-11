import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireChildOrFamilyParent } from "@/lib/auth-guard";

/**
 * GET /api/wallets/[childId]
 * Child or Parent views the child's Spend and Save wallet balances, recent activity,
 * and upcoming allowance (FR-3.1, FR-3.2, FR-11.4).
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ childId: string }> },
) {
  try {
    const { childId } = await context.params;
    const { child } = await requireChildOrFamilyParent(req, childId);

    const [wallet, recentActivity, upcomingAllowances, activeGoals] =
      await Promise.all([
        prisma.wallet.findUnique({
          where: { childId: child.id },
        }),
        prisma.ledgerEntry.findMany({
          where: {
            childId: child.id,
            walletBucket: { in: ["SPEND", "SAVE", "GIVE"] },
          },
          orderBy: { createdAt: "desc" },
          take: 30,
        }),
        prisma.allowanceRule.findMany({
          where: {
            childId: child.id,
            status: "ACTIVE",
          },
          orderBy: { nextRunAt: "asc" },
        }),
        prisma.savingsGoal.findMany({
          where: {
            childId: child.id,
            status: "ACTIVE",
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    if (!wallet) {
      throw new ApiError(404, "Child wallet not found", "WALLET_NOT_FOUND");
    }

    const totalBucketBalance = wallet.spendBalance.plus(wallet.saveBalance);

    const goalsTotal = activeGoals.reduce(
      (acc, g) => acc.plus(g.currentAmount),
      new Prisma.Decimal(0),
    );

    return apiSuccess({
      childId: child.id,
      childName: child.name,
      age: child.age,
      currency: child.family.currency,
      isFrozen: child.isFrozen || wallet.isFrozen,
      wallet: {
        id: wallet.id,
        spendBalance: wallet.spendBalance.toString(),
        saveBalance: wallet.saveBalance.toString(),

        lockedPendingBalance: wallet.lockedPendingBalance.toString(),
        totalBucketBalance: totalBucketBalance.toString(),
        totalInSavingsGoals: goalsTotal.toString(),
        netWorth: totalBucketBalance.plus(goalsTotal).toString(),
        defaultSplitSpend: wallet.defaultSplitSpend,
        defaultSplitSave: wallet.defaultSplitSave,

        isFrozen: wallet.isFrozen,
      },
      upcomingAllowances: upcomingAllowances.map((rule) => ({
        id: rule.id,
        amount: rule.amount.toString(),
        frequency: rule.frequency,
        nextRunAt: rule.nextRunAt,
        requireAllChores: rule.requireAllChores,
        reduceByMissedChores: rule.reduceByMissedChores,
      })),
      recentActivity: recentActivity.map((entry) => ({
        id: entry.id,
        walletBucket: entry.walletBucket,
        amount: entry.amount.toString(),
        direction: entry.direction,
        type: entry.type,
        status: entry.status,
        description: entry.description,
        createdAt: entry.createdAt,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
