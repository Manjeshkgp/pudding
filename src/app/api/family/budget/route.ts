import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { apiSuccess, handleRouteError, validateBody } from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import { addVirtualFamilyBudget } from "@/services/ledger.service";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const addBudgetSchema = z.object({
  amount: z
    .number()
    .positive("Amount must be greater than 0")
    .max(50000, "Amount exceeds maximum allowed"),
  description: z.string().trim().max(200).optional(),
  idempotencyKey: z.string().trim().min(4).max(128).optional(),
});

/**
 * GET /api/family/budget
 * Real-time view of Family Balance (FR-2.2):
 * Separated into: available (unallocatedBudget), allocatedToKids (sum of all child buckets + active goals),
 * and pending (pending spending requests + locked pending PayPal claims).
 */
export async function GET(req: NextRequest) {
  try {
    const { family } = await requireParent(req);

    const [children, pendingRequestsAgg, activeGoalsAgg, recentLedger] =
      await Promise.all([
        prisma.child.findMany({
          where: { familyId: family.id },
          include: { wallet: true },
          orderBy: { createdAt: "asc" },
        }),
        prisma.spendingRequest.aggregate({
          where: {
            familyId: family.id,
            status: {
              in: ["PENDING_APPROVAL", "APPROVED", "PAID_PENDING_CLAIM"],
            },
          },
          _sum: { amount: true },
        }),
        prisma.savingsGoal.aggregate({
          where: {
            child: { familyId: family.id },
            status: "ACTIVE",
          },
          _sum: { currentAmount: true },
        }),
        prisma.ledgerEntry.findMany({
          where: { familyId: family.id },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
      ]);

    let allocatedInBuckets = new Prisma.Decimal(0);
    let lockedPendingInWallets = new Prisma.Decimal(0);

    for (const child of children) {
      if (child.wallet) {
        allocatedInBuckets = allocatedInBuckets
          .plus(child.wallet.spendBalance)
          .plus(child.wallet.saveBalance);
        lockedPendingInWallets = lockedPendingInWallets.plus(
          child.wallet.lockedPendingBalance,
        );
      }
    }

    const allocatedInGoals =
      activeGoalsAgg._sum.currentAmount ?? new Prisma.Decimal(0);
    const totalAllocatedToKids = allocatedInBuckets.plus(allocatedInGoals);
    const pendingRequestsTotal =
      pendingRequestsAgg._sum.amount ?? new Prisma.Decimal(0);

    return apiSuccess({
      familyId: family.id,
      currency: family.currency,
      availableUnallocatedBudget: family.unallocatedBudget.toString(),
      allocatedToKidsTotal: totalAllocatedToKids.toString(),
      allocatedBreakdown: {
        inChildWalletBuckets: allocatedInBuckets.toString(),
        inActiveSavingsGoals: allocatedInGoals.toString(),
      },
      pendingTotal: pendingRequestsTotal.toString(),
      lockedPendingClaimsTotal: lockedPendingInWallets.toString(),
      autoTopUp: {
        amount: family.autoTopUpAmount?.toString() ?? null,
        threshold: family.autoTopUpThreshold?.toString() ?? null,
        schedule: family.autoTopUpSchedule ?? null,
      },
      childrenWallets: children.map((c) => ({
        childId: c.id,
        name: c.name,
        avatar: c.avatar,
        spendBalance: c.wallet?.spendBalance.toString() ?? "0.00",
        saveBalance: c.wallet?.saveBalance.toString() ?? "0.00",

        lockedPendingBalance:
          c.wallet?.lockedPendingBalance.toString() ?? "0.00",
      })),
      recentLedgerEntries: recentLedger.map((entry) => ({
        ...entry,
        amount: entry.amount.toString(),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/family/budget
 * Adds virtual funds to the Family's Unallocated Budget (FR-2.1, FR-2.5, INT-2).
 */
export async function POST(req: NextRequest) {
  try {
    const { user, family } = await requireParent(req, "canManageBudget");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, addBudgetSchema);

    const headerIdempotencyKey = req.headers.get("x-idempotency-key");
    const idempotencyKey =
      input.idempotencyKey ||
      headerIdempotencyKey ||
      `budget-add:${family.id}:${user.id}:${Date.now()}`;

    const result = await addVirtualFamilyBudget({
      familyId: family.id,
      amount: input.amount,
      idempotencyKey,
      actorUserId: user.id,
      description: input.description,
    });

    if (!result.idempotentReplay) {
      await writeAuditLog({
        familyId: family.id,
        actorUserId: user.id,
        actorRole: user.role,
        action: "FAMILY_BUDGET_ADDED",
        targetType: "Family",
        targetId: family.id,
        details: {
          amountAdded: input.amount,
          newUnallocatedBudget: result.family.unallocatedBudget.toString(),
          ledgerEntryId: result.ledgerEntry.id,
        },
        ipAddress,
        userAgent,
      });
    }

    return apiSuccess(
      {
        unallocatedBudget: result.family.unallocatedBudget.toString(),
        ledgerEntry: {
          ...result.ledgerEntry,
          amount: result.ledgerEntry.amount.toString(),
        },
        idempotentReplay: result.idempotentReplay,
      },
      result.idempotentReplay ? 200 : 201,
      "Virtual family budget updated",
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
