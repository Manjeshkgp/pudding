import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import { RECIPIENT_EMAIL_WARNING_MESSAGE } from "@/services/spending-rules.service";

/**
 * GET /api/parent/dashboard
 * Single aggregated Parent Dashboard endpoint (FR-10.1, FR-10.3):
 * Returns:
 * - Family Balance summary (unallocated, allocated to kids, pending requests)
 * - Overview of all children (balances, active goals, allowance rules, spending limits)
 * - Pending approvals queue (chores awaiting review, spending requests awaiting review, donations awaiting review)
 * - Upcoming scheduled allowance payments
 * - Spending & savings analytics (category breakdown charts, savings rate, chore completion rate)
 */
export async function GET(req: NextRequest) {
  try {
    const { user, family } = await requireParent(req);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      children,
      pendingChoreSubmissions,
      pendingSpendRequests,
      pendingDonations,
      upcomingAllowances,
      completedSpends30d,
      allChoreSubmissions30d,
      recentLedgerEntries,
      unreadNotificationsCount,
    ] = await Promise.all([
      prisma.child.findMany({
        where: { familyId: family.id },
        include: {
          wallet: true,
          spendingRule: true,
          savingsGoals: {
            where: { status: "ACTIVE" },
            orderBy: { createdAt: "desc" },
          },
          allowanceRules: {
            where: { status: { not: "CANCELLED" } },
          },
          earnedBadges: {
            include: { badge: true },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.choreSubmission.findMany({
        where: {
          chore: { familyId: family.id },
          status: "PENDING",
        },
        include: {
          chore: true,
          child: { select: { id: true, name: true, avatar: true } },
        },
        orderBy: { submittedAt: "asc" },
      }),
      prisma.spendingRequest.findMany({
        where: {
          familyId: family.id,
          status: { in: ["PENDING_APPROVAL", "APPROVED", "COUNTER_OFFERED"] },
        },
        include: {
          child: { select: { id: true, name: true, avatar: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.donation.findMany({
        where: {
          familyId: family.id,
          status: "PENDING_APPROVAL",
        },
        include: {
          charity: true,
          child: { select: { id: true, name: true, avatar: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.allowanceRule.findMany({
        where: {
          child: { familyId: family.id },
          status: "ACTIVE",
        },
        include: {
          child: { select: { id: true, name: true, avatar: true } },
        },
        orderBy: { nextRunAt: "asc" },
      }),
      prisma.spendingRequest.findMany({
        where: {
          familyId: family.id,
          status: { in: ["PAID_COMPLETED", "PAID_PENDING_CLAIM"] },
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.choreSubmission.findMany({
        where: {
          chore: { familyId: family.id },
          submittedAt: { gte: thirtyDaysAgo },
        },
        select: { status: true, childId: true },
      }),
      prisma.ledgerEntry.findMany({
        where: {
          familyId: family.id,
          status: "COMPLETED",
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.notification.count({
        where: {
          familyId: family.id,
          childId: null,
          isRead: false,
        },
      }),
    ]);

    // Calculate Family Totals
    let totalInChildBuckets = new Prisma.Decimal(0);
    let totalInActiveGoals = new Prisma.Decimal(0);
    let totalLockedPending = new Prisma.Decimal(0);

    for (const child of children) {
      if (child.wallet) {
        totalInChildBuckets = totalInChildBuckets
          .plus(child.wallet.spendBalance)
          .plus(child.wallet.saveBalance)
          .plus(child.wallet.giveBalance);
        totalLockedPending = totalLockedPending.plus(
          child.wallet.lockedPendingBalance
        );
      }
      for (const g of child.savingsGoals) {
        totalInActiveGoals = totalInActiveGoals.plus(g.currentAmount);
      }
    }

    const pendingSpendTotal = pendingSpendRequests.reduce(
      (acc, r) => acc.plus(r.amount),
      new Prisma.Decimal(0)
    );

    // Calculate Spending by Category Chart Data (FR-10.3)
    const categoryTotals = new Map<string, Prisma.Decimal>();
    let totalSpent30d = new Prisma.Decimal(0);

    for (const reqItem of completedSpends30d) {
      totalSpent30d = totalSpent30d.plus(reqItem.amount);
      const prev =
        categoryTotals.get(reqItem.category) ?? new Prisma.Decimal(0);
      categoryTotals.set(reqItem.category, prev.plus(reqItem.amount));
    }

    const spendingByCategory = Array.from(categoryTotals.entries()).map(
      ([category, amt]) => ({
        category,
        amount: amt.toString(),
        percentage: totalSpent30d.gt(0)
          ? Math.round(amt.div(totalSpent30d).mul(100).toNumber())
          : 0,
      })
    );

    // Calculate 30-day Family Savings Rate & Chore Completion Rate (FR-10.3)
    let totalCreditedToKids30d = new Prisma.Decimal(0);
    let totalSavedByKids30d = new Prisma.Decimal(0);

    for (const entry of recentLedgerEntries) {
      if (
        entry.childId &&
        entry.direction === "CREDIT" &&
        (entry.type === "ALLOWANCE" ||
          entry.type === "CHORE_REWARD" ||
          entry.type === "INSTANT_TRANSFER")
      ) {
        totalCreditedToKids30d = totalCreditedToKids30d.plus(entry.amount);
        if (entry.walletBucket === "SAVE") {
          totalSavedByKids30d = totalSavedByKids30d.plus(entry.amount);
        }
      }
      if (entry.type === "GOAL_DEPOSIT") {
        totalSavedByKids30d = totalSavedByKids30d.plus(entry.amount);
      }
    }

    const familySavingsRatePercent = totalCreditedToKids30d.gt(0)
      ? Math.min(
          100,
          Math.round(
            totalSavedByKids30d.div(totalCreditedToKids30d).mul(100).toNumber()
          )
        )
      : 20;

    const approvedChores30d = allChoreSubmissions30d.filter(
      (s) => s.status === "APPROVED"
    ).length;
    const choreCompletionRatePercent =
      allChoreSubmissions30d.length > 0
        ? Math.round((approvedChores30d / allChoreSubmissions30d.length) * 100)
        : 100;

    return apiSuccess({
      parent: {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        email: user.email,
        role: user.role,
        paypalIsVerified: user.paypalIsVerified,
        paypalVerifiedEmail: user.paypalVerifiedEmail,
      },
      familyWallet: {
        familyId: family.id,
        familyName: family.name,
        familyCode: family.familyCode,
        currency: family.currency,
        availableUnallocatedBudget: family.unallocatedBudget.toString(),
        allocatedToKidsTotal: totalInChildBuckets
          .plus(totalInActiveGoals)
          .toString(),
        inChildBuckets: totalInChildBuckets.toString(),
        inActiveSavingsGoals: totalInActiveGoals.toString(),
        pendingRequestsTotal: pendingSpendTotal.toString(),
        lockedPendingClaimsTotal: totalLockedPending.toString(),
        autoTopUpAmount: family.autoTopUpAmount?.toString() ?? null,
        autoTopUpThreshold: family.autoTopUpThreshold?.toString() ?? null,
      },
      children: children.map((c) => ({
        id: c.id,
        name: c.name,
        age: c.age,
        avatar: c.avatar,
        theme: c.theme,
        isFrozen: c.isFrozen,
        streakCount: c.streakCount,
        level: c.level,
        xp: c.xp,
        wallet: c.wallet
          ? {
              id: c.wallet.id,
              spendBalance: c.wallet.spendBalance.toString(),
              saveBalance: c.wallet.saveBalance.toString(),
              giveBalance: c.wallet.giveBalance.toString(),
              lockedPendingBalance:
                c.wallet.lockedPendingBalance.toString(),
              defaultSplitSpend: c.wallet.defaultSplitSpend,
              defaultSplitSave: c.wallet.defaultSplitSave,
              defaultSplitGive: c.wallet.defaultSplitGive,
              isFrozen: c.wallet.isFrozen,
            }
          : null,
        activeGoalsCount: c.savingsGoals.length,
        activeGoals: c.savingsGoals.map((g) => ({
          id: g.id,
          name: g.name,
          currentAmount: g.currentAmount.toString(),
          targetAmount: g.targetAmount.toString(),
          matchPercentage: g.matchPercentage.toString(),
          interestRateApr: g.interestRateApr.toString(),
          isLocked: g.isLocked,
        })),
        allowanceRules: c.allowanceRules.map((a) => ({
          id: a.id,
          amount: a.amount.toString(),
          frequency: a.frequency,
          status: a.status,
          nextRunAt: a.nextRunAt,
        })),
        spendingRule: c.spendingRule
          ? {
              maxPerTransaction:
                c.spendingRule.maxPerTransaction?.toString() ?? null,
              dailyLimit: c.spendingRule.dailyLimit?.toString() ?? null,
              weeklyLimit: c.spendingRule.weeklyLimit?.toString() ?? null,
              monthlyLimit: c.spendingRule.monthlyLimit?.toString() ?? null,
            }
          : null,
        earnedBadgesCount: c.earnedBadges.length,
      })),
      approvalsQueue: {
        totalPendingCount:
          pendingChoreSubmissions.length +
          pendingSpendRequests.length +
          pendingDonations.length,
        choreSubmissions: pendingChoreSubmissions.map((s) => ({
          id: s.id,
          choreId: s.choreId,
          choreTitle: s.chore.title,
          rewardAmount: s.chore.rewardAmount.toString(),
          child: s.child,
          proofPhotoUrl: s.proofPhotoUrl,
          childNote: s.childNote,
          submittedAt: s.submittedAt,
        })),
        spendingRequests: pendingSpendRequests.map((r) => ({
          ...r,
          amount: r.amount.toString(),
          counterOfferAmount: r.counterOfferAmount?.toString() ?? null,
          recipientEmailWarning:
            r.optionType === "OPTION_A_PAYPAL_EMAIL"
              ? RECIPIENT_EMAIL_WARNING_MESSAGE
              : null,
        })),
        donations: pendingDonations.map((d) => ({
          ...d,
          amount: d.amount.toString(),
        })),
      },
      upcomingPayments: upcomingAllowances.map((a) => ({
        ruleId: a.id,
        child: a.child,
        amount: a.amount.toString(),
        frequency: a.frequency,
        nextRunAt: a.nextRunAt,
      })),
      insights30Days: {
        totalSpent30d: totalSpent30d.toString(),
        totalSaved30d: totalSavedByKids30d.toString(),
        familySavingsRatePercent,
        choreCompletionRatePercent,
        spendingByCategory,
      },
      unreadNotificationsCount,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
