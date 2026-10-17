import {
  LedgerEntryType,
  LedgerStatus,
  Prisma,
  WalletBucket,
} from "@prisma/client";
import prisma from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";

export interface SplitAllocation {
  spend: Prisma.Decimal;
  save: Prisma.Decimal;
  give: Prisma.Decimal;
}

/**
 * Splits an amount across Spend, Save, and Give buckets using integer percentages
 * that sum to 100%, ensuring exact cent rounding (any rounding remainder goes to Spend).
 */
export function calculateBucketSplit(
  totalAmount: Prisma.Decimal,
  splitSpend: number,
  splitSave: number,
  splitGive: number
): SplitAllocation {
  if (splitSpend + splitSave + splitGive !== 100) {
    throw new ApiError(
      400,
      "Bucket split percentages must add up to 100%",
      "INVALID_BUCKET_SPLIT"
    );
  }

  const totalCents = Math.round(totalAmount.mul(100).toNumber());
  const saveCents = Math.floor((totalCents * splitSave) / 100);
  const giveCents = Math.floor((totalCents * splitGive) / 100);
  const spendCents = totalCents - saveCents - giveCents;

  return {
    spend: new Prisma.Decimal(spendCents).div(100).toDecimalPlaces(2),
    save: new Prisma.Decimal(saveCents).div(100).toDecimalPlaces(2),
    give: new Prisma.Decimal(giveCents).div(100).toDecimalPlaces(2),
  };
}

export interface AddFamilyBudgetParams {
  familyId: string;
  amount: number | string | Prisma.Decimal;
  idempotencyKey: string;
  actorUserId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Adds virtual funds to the Family's Unallocated Budget (FR-2.1).
 * Enforces idempotency (INT-2) and admin-configurable per-transaction & daily funding limits (FR-2.5).
 */
export async function addVirtualFamilyBudget(params: AddFamilyBudgetParams) {
  const amount = new Prisma.Decimal(params.amount).toDecimalPlaces(2);
  if (amount.lte(0)) {
    throw new ApiError(400, "Amount must be greater than 0", "INVALID_AMOUNT");
  }

  // Check idempotency first
  const existingEntry = await prisma.ledgerEntry.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });
  if (existingEntry) {
    const family = await prisma.family.findUniqueOrThrow({
      where: { id: params.familyId },
    });
    return { family, ledgerEntry: existingEntry, idempotentReplay: true };
  }

  // Check global admin funding limits (FR-2.5)
  const limitsConfig = await prisma.systemConfig.findUnique({
    where: { key: "FUNDING_LIMITS" },
  });
  const maxPerTx =
    (limitsConfig?.value as { maxPerTransaction?: number } | null)
      ?.maxPerTransaction ?? 2000;
  const maxPerDay =
    (limitsConfig?.value as { maxPerDay?: number } | null)?.maxPerDay ?? 5000;

  if (amount.gt(maxPerTx)) {
    throw new ApiError(
      400,
      `Amount exceeds the per-transaction limit of $${maxPerTx.toFixed(2)}`,
      "FUNDING_LIMIT_EXCEEDED"
    );
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const todayAdds = await prisma.ledgerEntry.aggregate({
    where: {
      familyId: params.familyId,
      type: "BUDGET_ADD",
      direction: "CREDIT",
      status: "COMPLETED",
      createdAt: { gte: startOfDay },
    },
    _sum: { amount: true },
  });

  const addedToday = todayAdds._sum.amount ?? new Prisma.Decimal(0);
  if (addedToday.plus(amount).gt(maxPerDay)) {
    throw new ApiError(
      400,
      `Adding $${amount.toFixed(2)} would exceed the daily family budget limit of $${maxPerDay.toFixed(2)}`,
      "DAILY_FUNDING_LIMIT_EXCEEDED"
    );
  }

  return prisma.$transaction(async (tx) => {
    const family = await tx.family.update({
      where: { id: params.familyId },
      data: {
        unallocatedBudget: { increment: amount },
      },
    });

    const ledgerEntry = await tx.ledgerEntry.create({
      data: {
        familyId: params.familyId,
        walletBucket: "FAMILY_BUDGET",
        amount,
        direction: "CREDIT",
        type: "BUDGET_ADD",
        status: "COMPLETED",
        idempotencyKey: params.idempotencyKey,
        actorUserId: params.actorUserId ?? null,
        description:
          params.description ||
          `Added $${amount.toFixed(2)} to Virtual Family Budget`,
        metadata: params.metadata
          ? (params.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    return { family, ledgerEntry, idempotentReplay: false };
  });
}

export interface AdjustFamilyBudgetParams {
  familyId: string;
  amount: number | string | Prisma.Decimal;
  idempotencyKey: string;
  actorUserId: string;
  reason?: string;
}

/**
 * Reduces/adjusts unused Virtual Family Budget (replaces FR-2.4 withdrawal).
 * Guarantees unallocatedBudget never goes below 0.00.
 */
export async function reduceVirtualFamilyBudget(
  params: AdjustFamilyBudgetParams
) {
  const amount = new Prisma.Decimal(params.amount).toDecimalPlaces(2);
  if (amount.lte(0)) {
    throw new ApiError(400, "Reduction amount must be greater than 0");
  }

  const existingEntry = await prisma.ledgerEntry.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });
  if (existingEntry) {
    const family = await prisma.family.findUniqueOrThrow({
      where: { id: params.familyId },
    });
    return { family, ledgerEntry: existingEntry, idempotentReplay: true };
  }

  return prisma.$transaction(async (tx) => {
    // Row-level lock on Family to prevent concurrent overdraft
    const rows = await tx.$queryRaw<
      Array<{ id: string; unallocatedBudget: Prisma.Decimal; isFrozen: boolean }>
    >`SELECT "id", "unallocatedBudget", "isFrozen" FROM "Family" WHERE "id" = ${params.familyId} FOR UPDATE`;

    const lockedFamily = rows[0];
    if (!lockedFamily) {
      throw new ApiError(404, "Family not found", "FAMILY_NOT_FOUND");
    }
    if (lockedFamily.isFrozen) {
      throw new ApiError(403, "Family account is frozen", "FAMILY_FROZEN");
    }

    const currentBudget = new Prisma.Decimal(lockedFamily.unallocatedBudget);
    if (currentBudget.lt(amount)) {
      throw new ApiError(
        400,
        `Cannot reduce budget by $${amount.toFixed(2)}. Available unallocated budget is $${currentBudget.toFixed(2)}.`,
        "INSUFFICIENT_FAMILY_BUDGET"
      );
    }

    const family = await tx.family.update({
      where: { id: params.familyId },
      data: {
        unallocatedBudget: { decrement: amount },
      },
    });

    const ledgerEntry = await tx.ledgerEntry.create({
      data: {
        familyId: params.familyId,
        walletBucket: "FAMILY_BUDGET",
        amount,
        direction: "DEBIT",
        type: "BUDGET_ADJUST",
        status: "COMPLETED",
        idempotencyKey: params.idempotencyKey,
        actorUserId: params.actorUserId,
        description:
          params.reason ||
          `Reduced unallocated Virtual Family Budget by $${amount.toFixed(2)}`,
      },
    });

    return { family, ledgerEntry, idempotentReplay: false };
  });
}

export interface TransferFamilyToChildParams {
  familyId: string;
  childId: string;
  amount: number | string | Prisma.Decimal;
  idempotencyKey: string;
  entryType: LedgerEntryType;
  targetBucket?: "DEFAULT_SPLIT" | "SPEND" | "SAVE" | "GIVE";
  referenceId?: string;
  actorUserId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  allowAutoTopUp?: boolean;
}

/**
 * Atomically transfers virtual funds from the Parent's Unallocated Family Budget
 * to a Child's Wallet (either split by default percentages or into a single bucket).
 * Creates double-entry LedgerEntry rows: DEBIT on FAMILY_BUDGET and CREDIT(s) on Child bucket(s).
 */
export async function transferFromFamilyToChild(
  params: TransferFamilyToChildParams
) {
  const amount = new Prisma.Decimal(params.amount).toDecimalPlaces(2);
  if (amount.lte(0)) {
    throw new ApiError(400, "Transfer amount must be greater than 0");
  }

  const debitKey = `${params.idempotencyKey}:family-debit`;
  const existingDebit = await prisma.ledgerEntry.findUnique({
    where: { idempotencyKey: debitKey },
  });
  if (existingDebit) {
    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { childId: params.childId },
    });
    const family = await prisma.family.findUniqueOrThrow({
      where: { id: params.familyId },
    });
    return {
      family,
      wallet,
      entries: [existingDebit],
      idempotentReplay: true,
    };
  }

  return prisma.$transaction(async (tx) => {
    // 1. Lock Family row
    const familyRows = await tx.$queryRaw<
      Array<{
        id: string;
        unallocatedBudget: Prisma.Decimal;
        autoTopUpAmount: Prisma.Decimal | null;
        autoTopUpThreshold: Prisma.Decimal | null;
        isFrozen: boolean;
      }>
    >`SELECT "id", "unallocatedBudget", "autoTopUpAmount", "autoTopUpThreshold", "isFrozen" FROM "Family" WHERE "id" = ${params.familyId} FOR UPDATE`;

    const lockedFamily = familyRows[0];
    if (!lockedFamily) {
      throw new ApiError(404, "Family not found", "FAMILY_NOT_FOUND");
    }
    if (lockedFamily.isFrozen) {
      throw new ApiError(403, "Family account is frozen", "FAMILY_FROZEN");
    }

    // 2. Lock Child Wallet row
    const walletRows = await tx.$queryRaw<
      Array<{
        id: string;
        childId: string;
        defaultSplitSpend: number;
        defaultSplitSave: number;
        defaultSplitGive: number;
        isFrozen: boolean;
      }>
    >`SELECT "id", "childId", "defaultSplitSpend", "defaultSplitSave", "defaultSplitGive", "isFrozen" FROM "Wallet" WHERE "childId" = ${params.childId} FOR UPDATE`;

    const lockedWallet = walletRows[0];
    if (!lockedWallet) {
      throw new ApiError(404, "Child wallet not found", "WALLET_NOT_FOUND");
    }

    let currentBudget = new Prisma.Decimal(lockedFamily.unallocatedBudget);

    // Optional Auto Top-Up if balance falls below threshold or is insufficient (FR-2.7)
    if (
      params.allowAutoTopUp !== false &&
      lockedFamily.autoTopUpAmount &&
      new Prisma.Decimal(lockedFamily.autoTopUpAmount).gt(0)
    ) {
      const threshold = lockedFamily.autoTopUpThreshold
        ? new Prisma.Decimal(lockedFamily.autoTopUpThreshold)
        : new Prisma.Decimal(0);

      if (currentBudget.minus(amount).lt(threshold) || currentBudget.lt(amount)) {
        const topUpAmt = new Prisma.Decimal(lockedFamily.autoTopUpAmount);
        // Ensure top-up covers the needed amount
        const needed = amount.minus(currentBudget);
        const effectiveTopUp = topUpAmt.gte(needed) ? topUpAmt : needed;

        await tx.family.update({
          where: { id: params.familyId },
          data: {
            unallocatedBudget: { increment: effectiveTopUp },
          },
        });

        await tx.ledgerEntry.create({
          data: {
            familyId: params.familyId,
            walletBucket: "FAMILY_BUDGET",
            amount: effectiveTopUp,
            direction: "CREDIT",
            type: "BUDGET_ADD",
            status: "COMPLETED",
            idempotencyKey: `${params.idempotencyKey}:auto-topup`,
            description: `Auto top-up of $${effectiveTopUp.toFixed(2)} triggered for family budget`,
            metadata: { trigger: params.entryType },
          },
        });

        currentBudget = currentBudget.plus(effectiveTopUp);
      }
    }

    if (currentBudget.lt(amount)) {
      throw new ApiError(
        400,
        `Insufficient unallocated family budget ($${currentBudget.toFixed(2)} available, $${amount.toFixed(2)} required)`,
        "INSUFFICIENT_FAMILY_BUDGET",
        {
          availableBudget: currentBudget.toString(),
          requiredAmount: amount.toString(),
        }
      );
    }

    // 3. Debit Family Unallocated Budget
    const updatedFamily = await tx.family.update({
      where: { id: params.familyId },
      data: {
        unallocatedBudget: { decrement: amount },
      },
    });

    const createdEntries = [];

    const familyDebitEntry = await tx.ledgerEntry.create({
      data: {
        familyId: params.familyId,
        childId: params.childId,
        walletBucket: "FAMILY_BUDGET",
        amount,
        direction: "DEBIT",
        type: params.entryType,
        status: "COMPLETED",
        idempotencyKey: debitKey,
        referenceId: params.referenceId ?? null,
        actorUserId: params.actorUserId ?? null,
        description: params.description,
        metadata: params.metadata
          ? (params.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
    createdEntries.push(familyDebitEntry);

    // 4. Determine bucket allocation and credit Child Wallet
    const mode = params.targetBucket || "DEFAULT_SPLIT";
    let spendInc = new Prisma.Decimal(0);
    let saveInc = new Prisma.Decimal(0);
    let giveInc = new Prisma.Decimal(0);

    if (mode === "DEFAULT_SPLIT") {
      const split = calculateBucketSplit(
        amount,
        lockedWallet.defaultSplitSpend,
        lockedWallet.defaultSplitSave,
        lockedWallet.defaultSplitGive
      );
      spendInc = split.spend;
      saveInc = split.save;
      giveInc = split.give;
    } else if (mode === "SPEND") {
      spendInc = amount;
    } else if (mode === "SAVE") {
      saveInc = amount;
    } else if (mode === "GIVE") {
      giveInc = amount;
    }

    const updatedWallet = await tx.wallet.update({
      where: { id: lockedWallet.id },
      data: {
        spendBalance: { increment: spendInc },
        saveBalance: { increment: saveInc },
        giveBalance: { increment: giveInc },
      },
    });

    const bucketCredits: Array<{ bucket: WalletBucket; amt: Prisma.Decimal }> = [
      { bucket: "SPEND", amt: spendInc },
      { bucket: "SAVE", amt: saveInc },
      { bucket: "GIVE", amt: giveInc },
    ];

    for (const item of bucketCredits) {
      if (item.amt.gt(0)) {
        const creditEntry = await tx.ledgerEntry.create({
          data: {
            familyId: params.familyId,
            childId: params.childId,
            walletBucket: item.bucket,
            amount: item.amt,
            direction: "CREDIT",
            type: params.entryType,
            status: "COMPLETED",
            idempotencyKey: `${params.idempotencyKey}:child-credit:${item.bucket}`,
            referenceId: params.referenceId ?? null,
            actorUserId: params.actorUserId ?? null,
            description: `${params.description} (${item.bucket} bucket)`,
            metadata: params.metadata
              ? (params.metadata as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          },
        });
        createdEntries.push(creditEntry);
      }
    }

    return {
      family: updatedFamily,
      wallet: updatedWallet,
      entries: createdEntries,
      idempotentReplay: false,
    };
  });
}

export interface MoveBetweenChildBucketsParams {
  familyId: string;
  childId: string;
  fromBucket: "SPEND" | "SAVE" | "GIVE";
  toBucket: "SPEND" | "SAVE" | "GIVE";
  amount: number | string | Prisma.Decimal;
  idempotencyKey: string;
  actorUserId?: string;
  actorChildId?: string;
  description?: string;
}

/**
 * Moves money between a child's own buckets (e.g., SPEND -> SAVE or SPEND -> GIVE).
 * Enforces non-negative balance (FR-3.3) and records double-entry ledger rows (FR-3.4).
 */
export async function moveBetweenChildBuckets(
  params: MoveBetweenChildBucketsParams
) {
  if (params.fromBucket === params.toBucket) {
    throw new ApiError(400, "Source and destination buckets must be different");
  }

  const amount = new Prisma.Decimal(params.amount).toDecimalPlaces(2);
  if (amount.lte(0)) {
    throw new ApiError(400, "Transfer amount must be greater than 0");
  }

  const debitKey = `${params.idempotencyKey}:debit:${params.fromBucket}`;
  const existing = await prisma.ledgerEntry.findUnique({
    where: { idempotencyKey: debitKey },
  });
  if (existing) {
    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { childId: params.childId },
    });
    return { wallet, entries: [existing], idempotentReplay: true };
  }

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        spendBalance: Prisma.Decimal;
        saveBalance: Prisma.Decimal;
        giveBalance: Prisma.Decimal;
        isFrozen: boolean;
      }>
    >`SELECT "id", "spendBalance", "saveBalance", "giveBalance", "isFrozen" FROM "Wallet" WHERE "childId" = ${params.childId} FOR UPDATE`;

    const lockedWallet = rows[0];
    if (!lockedWallet) {
      throw new ApiError(404, "Wallet not found", "WALLET_NOT_FOUND");
    }
    if (lockedWallet.isFrozen) {
      throw new ApiError(
        403,
        "Child wallet is currently frozen",
        "WALLET_FROZEN"
      );
    }

    const bucketFieldMap = {
      SPEND: "spendBalance",
      SAVE: "saveBalance",
      GIVE: "giveBalance",
    } as const;

    const fromField = bucketFieldMap[params.fromBucket];
    const toField = bucketFieldMap[params.toBucket];

    const availableInSource = new Prisma.Decimal(lockedWallet[fromField]);
    if (availableInSource.lt(amount)) {
      throw new ApiError(
        400,
        `Insufficient funds in ${params.fromBucket} bucket ($${availableInSource.toFixed(2)} available)`,
        "INSUFFICIENT_BUCKET_BALANCE"
      );
    }

    const updatedWallet = await tx.wallet.update({
      where: { id: lockedWallet.id },
      data: {
        [fromField]: { decrement: amount },
        [toField]: { increment: amount },
      },
    });

    const desc =
      params.description ||
      `Moved $${amount.toFixed(2)} from ${params.fromBucket} to ${params.toBucket} bucket`;

    const debitEntry = await tx.ledgerEntry.create({
      data: {
        familyId: params.familyId,
        childId: params.childId,
        walletBucket: params.fromBucket,
        amount,
        direction: "DEBIT",
        type: "BUCKET_TRANSFER",
        status: "COMPLETED",
        idempotencyKey: debitKey,
        actorUserId: params.actorUserId ?? null,
        actorChildId: params.actorChildId ?? null,
        description: desc,
      },
    });

    const creditEntry = await tx.ledgerEntry.create({
      data: {
        familyId: params.familyId,
        childId: params.childId,
        walletBucket: params.toBucket,
        amount,
        direction: "CREDIT",
        type: "BUCKET_TRANSFER",
        status: "COMPLETED",
        idempotencyKey: `${params.idempotencyKey}:credit:${params.toBucket}`,
        actorUserId: params.actorUserId ?? null,
        actorChildId: params.actorChildId ?? null,
        description: desc,
      },
    });

    return {
      wallet: updatedWallet,
      entries: [debitEntry, creditEntry],
      idempotentReplay: false,
    };
  });
}

export interface DebitChildBucketParams {
  familyId: string;
  childId: string;
  bucket: "SPEND" | "SAVE" | "GIVE";
  amount: number | string | Prisma.Decimal;
  idempotencyKey: string;
  entryType: LedgerEntryType;
  status?: LedgerStatus;
  lockAsPendingClaim?: boolean;
  referenceId?: string;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  actorUserId?: string;
  actorChildId?: string;
  description: string;
  metadata?: Record<string, unknown>;
}

/**
 * Atomically debits a child's bucket (e.g., for Spend Option A, Spend Option B, Goal Deposit, or Donation).
 * If lockAsPendingClaim is true (PayPal UNCLAIMED/PENDING), moves the amount into lockedPendingBalance.
 */
export async function debitChildBucket(params: DebitChildBucketParams) {
  const amount = new Prisma.Decimal(params.amount).toDecimalPlaces(2);
  if (amount.lte(0)) {
    throw new ApiError(400, "Debit amount must be greater than 0");
  }

  const existing = await prisma.ledgerEntry.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });
  if (existing) {
    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { childId: params.childId },
    });
    return { wallet, ledgerEntry: existing, idempotentReplay: true };
  }

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        spendBalance: Prisma.Decimal;
        saveBalance: Prisma.Decimal;
        giveBalance: Prisma.Decimal;
        lockedPendingBalance: Prisma.Decimal;
        isFrozen: boolean;
      }>
    >`SELECT "id", "spendBalance", "saveBalance", "giveBalance", "lockedPendingBalance", "isFrozen" FROM "Wallet" WHERE "childId" = ${params.childId} FOR UPDATE`;

    const lockedWallet = rows[0];
    if (!lockedWallet) {
      throw new ApiError(404, "Child wallet not found", "WALLET_NOT_FOUND");
    }
    if (lockedWallet.isFrozen) {
      throw new ApiError(
        403,
        "Child wallet is currently frozen",
        "WALLET_FROZEN"
      );
    }

    const bucketFieldMap = {
      SPEND: "spendBalance",
      SAVE: "saveBalance",
      GIVE: "giveBalance",
    } as const;

    const field = bucketFieldMap[params.bucket];
    const currentBalance = new Prisma.Decimal(lockedWallet[field]);

    if (currentBalance.lt(amount)) {
      throw new ApiError(
        400,
        `Insufficient ${params.bucket} balance ($${currentBalance.toFixed(2)} available, $${amount.toFixed(2)} required)`,
        "INSUFFICIENT_CHILD_BALANCE"
      );
    }

    const walletUpdate: Prisma.WalletUpdateInput = {
      [field]: { decrement: amount },
      ...(params.lockAsPendingClaim
        ? { lockedPendingBalance: { increment: amount } }
        : {}),
    };

    const updatedWallet = await tx.wallet.update({
      where: { id: lockedWallet.id },
      data: walletUpdate,
    });

    const ledgerEntry = await tx.ledgerEntry.create({
      data: {
        familyId: params.familyId,
        childId: params.childId,
        walletBucket: params.bucket,
        amount,
        direction: "DEBIT",
        type: params.entryType,
        status: params.status || "COMPLETED",
        idempotencyKey: params.idempotencyKey,
        referenceId: params.referenceId ?? null,
        paypalOrderId: params.paypalOrderId ?? null,
        paypalCaptureId: params.paypalCaptureId ?? null,
        actorUserId: params.actorUserId ?? null,
        actorChildId: params.actorChildId ?? null,
        description: params.description,
        metadata: params.metadata
          ? (params.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    return {
      wallet: updatedWallet,
      ledgerEntry,
      idempotentReplay: false,
    };
  });
}
