import { Prisma, SpendingOptionType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";

export const STANDARD_SPENDING_CATEGORIES = [
  "TOYS_GAMES",
  "FOOD_SNACKS",
  "CLOTHING",
  "BOOKS_EDUCATION",
  "ENTERTAINMENT",
  "ELECTRONICS",
  "GIFTS_FRIENDS",
  "HOBBIES_SPORTS",
  "OTHER",
] as const;

export const RECIPIENT_EMAIL_WARNING_MESSAGE =
  "Please double-check the recipient's PayPal email address. Sending money to a wrong email address may send funds to the wrong person and cannot be automatically reversed.";

export interface EvaluateSpendingRuleResult {
  allowed: boolean;
  canAutoApprove: boolean;
  autoApproveReason?: string;
}

/**
 * Validates a child's spending request against:
 * 1. Child & Wallet freeze status (FR-7.6)
 * 2. Available Spend bucket balance (FR-3.3 - never negative)
 * 3. Per-transaction limit, Daily limit, Weekly limit, and Monthly limit (FR-7.4, NFR-5)
 * 4. Category approval rules & Merchant safe-list rules (FR-7.4, FR-7.5)
 */
export async function evaluateChildSpendingRules(params: {
  childId: string;
  amount: Prisma.Decimal;
  optionType: SpendingOptionType;
  category: string;
  merchantName?: string | null;
}): Promise<EvaluateSpendingRuleResult> {
  const child = await prisma.child.findUnique({
    where: { id: params.childId },
    include: {
      family: true,
      wallet: true,
      spendingRule: true,
    },
  });

  if (!child || !child.wallet) {
    throw new ApiError(404, "Child wallet not found", "WALLET_NOT_FOUND");
  }

  if (child.family.isFrozen || child.isFrozen || child.wallet.isFrozen) {
    throw new ApiError(
      403,
      "Spending is currently frozen on this wallet (FR-7.6)",
      "SPENDING_FROZEN"
    );
  }

  // Account for any existing pending approval requests so child cannot submit 10 requests exceeding their balance
  const pendingAgg = await prisma.spendingRequest.aggregate({
    where: {
      childId: child.id,
      status: { in: ["PENDING_APPROVAL", "APPROVED", "COUNTER_OFFERED"] },
    },
    _sum: { amount: true },
  });

  const reservedPending = pendingAgg._sum.amount ?? new Prisma.Decimal(0);
  const availableToRequest = child.wallet.spendBalance.minus(reservedPending);

  if (params.amount.gt(availableToRequest)) {
    throw new ApiError(
      400,
      `Insufficient Spend bucket balance ($${availableToRequest.toFixed(2)} available after pending requests, $${params.amount.toFixed(2)} requested)`,
      "INSUFFICIENT_SPEND_BALANCE",
      {
        spendBalance: child.wallet.spendBalance.toString(),
        reservedPending: reservedPending.toString(),
        availableToRequest: availableToRequest.toString(),
      }
    );
  }

  const rule = child.spendingRule;
  if (!rule) {
    return { allowed: true, canAutoApprove: false };
  }

  // 1. Per-transaction limit (FR-7.4)
  if (rule.maxPerTransaction && params.amount.gt(rule.maxPerTransaction)) {
    throw new ApiError(
      400,
      `Amount ($${params.amount.toFixed(2)}) exceeds your per-transaction limit of $${rule.maxPerTransaction.toFixed(2)}`,
      "PER_TRANSACTION_LIMIT_EXCEEDED"
    );
  }

  const now = new Date();

  // Helper to sum completed + pending spends within a time window
  async function getSpentSince(sinceDate: Date): Promise<Prisma.Decimal> {
    const agg = await prisma.spendingRequest.aggregate({
      where: {
        childId: child!.id,
        status: {
          in: [
            "PENDING_APPROVAL",
            "APPROVED",
            "PAID_COMPLETED",
            "PAID_PENDING_CLAIM",
          ],
        },
        createdAt: { gte: sinceDate },
      },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? new Prisma.Decimal(0);
  }

  // 2. Daily limit (FR-7.4)
  if (rule.dailyLimit) {
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const spentToday = await getSpentSince(startOfDay);
    if (spentToday.plus(params.amount).gt(rule.dailyLimit)) {
      throw new ApiError(
        400,
        `This request would exceed your daily spending limit of $${rule.dailyLimit.toFixed(2)} ($${spentToday.toFixed(2)} already used today)`,
        "DAILY_LIMIT_EXCEEDED"
      );
    }
  }

  // 3. Weekly limit (FR-7.4)
  if (rule.weeklyLimit) {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const spentWeek = await getSpentSince(sevenDaysAgo);
    if (spentWeek.plus(params.amount).gt(rule.weeklyLimit)) {
      throw new ApiError(
        400,
        `This request would exceed your weekly spending limit of $${rule.weeklyLimit.toFixed(2)} ($${spentWeek.toFixed(2)} used in last 7 days)`,
        "WEEKLY_LIMIT_EXCEEDED"
      );
    }
  }

  // 4. Monthly limit (FR-7.4)
  if (rule.monthlyLimit) {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const spentMonth = await getSpentSince(thirtyDaysAgo);
    if (spentMonth.plus(params.amount).gt(rule.monthlyLimit)) {
      throw new ApiError(
        400,
        `This request would exceed your monthly spending limit of $${rule.monthlyLimit.toFixed(2)} ($${spentMonth.toFixed(2)} used in last 30 days)`,
        "MONTHLY_LIMIT_EXCEEDED"
      );
    }
  }

  // 5. Determine if Option B request qualifies for Auto-Approval (FR-7.4, FR-7.5)
  // Note: Option A (PayPal real-money checkout) ALWAYS requires the parent to complete PayPal Checkout popup.
  if (params.optionType === "OPTION_A_PAYPAL_EMAIL") {
    return { allowed: true, canAutoApprove: false };
  }

  const normalizedCategory = params.category.trim().toUpperCase();
  const normalizedMerchant = params.merchantName?.trim().toLowerCase() || "";

  const categoryForcesApproval = rule.requireApprovalCategories
    .map((c) => c.toUpperCase())
    .includes(normalizedCategory);

  if (categoryForcesApproval) {
    return { allowed: true, canAutoApprove: false };
  }

  const underAutoApproveAmount =
    rule.autoApproveUnderAmount !== null &&
    params.amount.lte(rule.autoApproveUnderAmount);

  const inAutoApproveCategory = rule.autoApproveCategories
    .map((c) => c.toUpperCase())
    .includes(normalizedCategory);

  const inSafeListMerchant =
    normalizedMerchant.length > 0 &&
    rule.safeListMerchants
      .map((m) => m.toLowerCase())
      .includes(normalizedMerchant);

  if (underAutoApproveAmount && (inAutoApproveCategory || inSafeListMerchant)) {
    return {
      allowed: true,
      canAutoApprove: true,
      autoApproveReason: `Auto-approved under parent safe-list rule (<= $${rule.autoApproveUnderAmount!.toFixed(2)})`,
    };
  }

  return { allowed: true, canAutoApprove: false };
}
