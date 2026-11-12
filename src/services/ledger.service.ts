import {
  LedgerEntry,
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
}

/**
 * Splits an amount across Spend and Save using integer percentages
 * that sum to 100%, ensuring exact cent rounding (any rounding remainder goes to Spend).
 */
export function calculateBucketSplit(
  totalAmount: Prisma.Decimal,
  splitSpend: number,
  splitSave: number,
): SplitAllocation {
  if (splitSpend + splitSave !== 100) {
    throw new ApiError(
      400,
      "Bucket split percentages must add up to 100%",
      "INVALID_BUCKET_SPLIT",
    );
  }

  const totalCents = Math.round(totalAmount.mul(100).toNumber());
  const saveCents = Math.floor((totalCents * splitSave) / 100);
  const spendCents = totalCents - saveCents;

  return {
    spend: new Prisma.Decimal(spendCents).div(100).toDecimalPlaces(2),
    save: new Prisma.Decimal(saveCents).div(100).toDecimalPlaces(2),
  };
}

export interface TransferFamilyToChildParams {
  familyId: string;
  childId: string;
  amount: number | string | Prisma.Decimal;
  idempotencyKey: string;
  entryType: LedgerEntryType;
  targetBucket?: "DEFAULT_SPLIT" | "SPEND" | "SAVE";
  referenceId?: string;
  actorUserId?: string;
  description: string;
  metadata?: Record<string, unknown>;
}

/**
 * Atomically transfers virtual funds from the Parent's Unallocated Family Budget
 * to a Child's Wallet (either split by default percentages or into a single bucket).
 * Creates double-entry LedgerEntry rows: DEBIT on FAMILY_BUDGET and CREDIT(s) on Child bucket(s).
 */
export async function transferFromFamilyToChild(
  params: TransferFamilyToChildParams,
  transaction?: Prisma.TransactionClient,
) {
  const amount = new Prisma.Decimal(params.amount).toDecimalPlaces(2);
  if (amount.lte(0)) {
    throw new ApiError(400, "Transfer amount must be greater than 0");
  }

  const debitKey = `${params.idempotencyKey}:family-debit`;
  const db = transaction ?? prisma;
  const existingDebit = await db.ledgerEntry.findUnique({
    where: { idempotencyKey: debitKey },
  });
  if (existingDebit) {
    assertReplay(
      existingDebit,
      params.familyId,
      amount,
      params.childId,
      params.entryType,
    );
    const wallet = await db.wallet.findUniqueOrThrow({
      where: { childId: params.childId },
    });
    const family = await db.family.findUniqueOrThrow({
      where: { id: params.familyId },
    });
    return {
      family,
      wallet,
      entries: [existingDebit],
      idempotentReplay: true,
    };
  }

  const transfer = async (tx: Prisma.TransactionClient) => {
    // 1. Lock Family row
    const familyRows = await tx.$queryRaw<
      Array<{
        id: string;
        unallocatedBudget: Prisma.Decimal;
        isFrozen: boolean;
      }>
    >`SELECT "id", "unallocatedBudget", "isFrozen" FROM "Family" WHERE "id" = ${params.familyId} FOR UPDATE`;

    const replay = await tx.ledgerEntry.findUnique({
      where: { idempotencyKey: debitKey },
    });
    if (replay) {
      assertReplay(
        replay,
        params.familyId,
        amount,
        params.childId,
        params.entryType,
      );
      return {
        family: await tx.family.findUniqueOrThrow({
          where: { id: params.familyId },
        }),
        wallet: await tx.wallet.findUniqueOrThrow({
          where: { childId: params.childId },
        }),
        entries: [replay],
        idempotentReplay: true,
      };
    }
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

        isFrozen: boolean;
      }>
    >`SELECT "id", "childId", "defaultSplitSpend", "defaultSplitSave", "isFrozen" FROM "Wallet" WHERE "childId" = ${params.childId} FOR UPDATE`;

    const lockedWallet = walletRows[0];
    if (!lockedWallet) {
      throw new ApiError(404, "Child wallet not found", "WALLET_NOT_FOUND");
    }

    const currentBudget = lockedFamily.unallocatedBudget;
    if (currentBudget.lt(amount)) {
      throw new ApiError(
        400,
        `Insufficient unallocated family budget ($${currentBudget.toFixed(2)} available, $${amount.toFixed(2)} required)`,
        "INSUFFICIENT_FAMILY_BUDGET",
        {
          availableBudget: currentBudget.toString(),
          requiredAmount: amount.toString(),
        },
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

    if (mode === "DEFAULT_SPLIT") {
      const split = calculateBucketSplit(
        amount,
        lockedWallet.defaultSplitSpend,
        lockedWallet.defaultSplitSave,
      );
      spendInc = split.spend;
      saveInc = split.save;
    } else if (mode === "SPEND") {
      spendInc = amount;
    } else if (mode === "SAVE") {
      saveInc = amount;
    }

    const updatedWallet = await tx.wallet.update({
      where: { id: lockedWallet.id },
      data: {
        spendBalance: { increment: spendInc },
        saveBalance: { increment: saveInc },
      },
    });

    const bucketCredits: Array<{ bucket: WalletBucket; amt: Prisma.Decimal }> =
      [
        { bucket: "SPEND", amt: spendInc },
        { bucket: "SAVE", amt: saveInc },
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
  };
  return transaction ? transfer(transaction) : prisma.$transaction(transfer);
}

interface ConvertSavingsToSpendParams {
  familyId: string;
  childId: string;
  amount: number;
  idempotencyKey: string;
}

/**
 * Converts a child's savings to spend allowance and records both ledger entries.
 */
export async function convertSavingsToSpend(
  params: ConvertSavingsToSpendParams,
) {
  const amount = new Prisma.Decimal(params.amount);
  if (amount.lte(0) || amount.decimalPlaces() > 2) {
    throw new ApiError(400, "Enter a positive amount in dollars and cents.");
  }

  const key = `save-to-spend:${params.childId}:${params.idempotencyKey}`;
  const debitKey = `${key}:debit`;

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        saveBalance: Prisma.Decimal;
        isFrozen: boolean;
      }>
    >`SELECT "id", "saveBalance", "isFrozen" FROM "Wallet" WHERE "childId" = ${params.childId} FOR UPDATE`;

    const replay = await tx.ledgerEntry.findUnique({
      where: { idempotencyKey: debitKey },
    });
    if (replay) {
      assertReplay(
        replay,
        params.familyId,
        amount,
        params.childId,
        "BUCKET_TRANSFER",
      );
      return {
        wallet: await tx.wallet.findUniqueOrThrow({
          where: { childId: params.childId },
        }),
        idempotentReplay: true,
      };
    }
    const lockedWallet = rows[0];
    if (!lockedWallet) {
      throw new ApiError(404, "Wallet not found", "WALLET_NOT_FOUND");
    }
    if (lockedWallet.isFrozen) {
      throw new ApiError(
        403,
        "Child wallet is currently frozen",
        "WALLET_FROZEN",
      );
    }

    if (lockedWallet.saveBalance.lt(amount)) {
      throw new ApiError(
        400,
        `You have $${lockedWallet.saveBalance.toFixed(2)} available in Savings.`,
        "INSUFFICIENT_BUCKET_BALANCE",
      );
    }

    const updatedWallet = await tx.wallet.update({
      where: { id: lockedWallet.id },
      data: {
        saveBalance: { decrement: amount },
        spendBalance: { increment: amount },
      },
    });

    const entry = {
      familyId: params.familyId,
      childId: params.childId,
      amount,
      type: "BUCKET_TRANSFER",
      status: "COMPLETED",
      actorChildId: params.childId,
      description: "Moved savings to Spend",
    } as const;
    await tx.ledgerEntry.createMany({
      data: [
        {
          ...entry,
          walletBucket: "SAVE",
          direction: "DEBIT",
          idempotencyKey: debitKey,
        },
        {
          ...entry,
          walletBucket: "SPEND",
          direction: "CREDIT",
          idempotencyKey: `${key}:credit`,
        },
      ],
    });

    return {
      wallet: updatedWallet,
      idempotentReplay: false,
    };
  });
}

function assertReplay(
  entry: LedgerEntry,
  familyId: string,
  amount: Prisma.Decimal,
  childId?: string,
  type?: LedgerEntryType,
) {
  if (
    entry.familyId !== familyId ||
    !entry.amount.equals(amount) ||
    (childId !== undefined && entry.childId !== childId) ||
    (type !== undefined && entry.type !== type)
  )
    throw new ApiError(
      409,
      "This request key belongs to a different ledger operation.",
      "IDEMPOTENCY_CONFLICT",
    );
}
