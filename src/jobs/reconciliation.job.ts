import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getPayPalOrderDetails } from "@/lib/paypal";
import { writeAuditLog } from "@/lib/audit";

export interface ReconciliationSummary {
  checkedCount: number;
  matchedCount: number;
  autoResolvedCount: number;
  mismatchesFlaggedCount: number;
  mismatches: Array<{
    spendingRequestId: string;
    paypalOrderId: string;
    localStatus: string;
    paypalStatus: string;
    localAmount: string;
    paypalAmount: string | null;
    issue: string;
  }>;
}

/**
 * Daily PayPal Reconciliation Job (INT-4):
 * Reconciles Option A PayPal SpendingRequests & LedgerEntries against live PayPal Order statuses,
 * auto-syncs pending claims that completed, and flags any discrepancies in AuditLog & Notifications.
 */
export async function runPayPalReconciliation(): Promise<ReconciliationSummary> {
  const requestsToVerify = await prisma.spendingRequest.findMany({
    where: {
      optionType: "OPTION_A_PAYPAL_EMAIL",
      paypalOrderId: { not: null },
      status: {
        in: ["APPROVED", "PAID_PENDING_CLAIM", "PAID_COMPLETED"],
      },
    },
    include: {
      child: {
        include: { wallet: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const summary: ReconciliationSummary = {
    checkedCount: requestsToVerify.length,
    matchedCount: 0,
    autoResolvedCount: 0,
    mismatchesFlaggedCount: 0,
    mismatches: [],
  };

  for (const reqItem of requestsToVerify) {
    if (!reqItem.paypalOrderId) continue;

    try {
      const orderDetails = await getPayPalOrderDetails(reqItem.paypalOrderId);
      const unit = orderDetails.purchase_units?.[0];
      const capture = unit?.payments?.captures?.[0];
      const paypalCaptureStatus = capture?.status || orderDetails.status;
      const paypalAmountStr =
        capture?.amount?.value || unit?.amount?.value || null;

      // Check amount mismatch
      if (paypalAmountStr) {
        const paypalAmt = new Prisma.Decimal(paypalAmountStr);
        if (!paypalAmt.equals(reqItem.amount)) {
          summary.mismatchesFlaggedCount += 1;
          summary.mismatches.push({
            spendingRequestId: reqItem.id,
            paypalOrderId: reqItem.paypalOrderId,
            localStatus: reqItem.status,
            paypalStatus: paypalCaptureStatus,
            localAmount: reqItem.amount.toString(),
            paypalAmount: paypalAmountStr,
            issue: "AMOUNT_MISMATCH",
          });
          continue;
        }
      }

      // Auto-resolve if local is PAID_PENDING_CLAIM and PayPal is now COMPLETED
      if (
        reqItem.status === "PAID_PENDING_CLAIM" &&
        paypalCaptureStatus === "COMPLETED"
      ) {
        await prisma.$transaction(async (tx) => {
          if (reqItem.child.wallet) {
            const dec = Prisma.Decimal.min(
              reqItem.child.wallet.lockedPendingBalance,
              reqItem.amount
            );
            await tx.wallet.update({
              where: { id: reqItem.child.wallet.id },
              data: { lockedPendingBalance: { decrement: dec } },
            });
          }

          await tx.spendingRequest.update({
            where: { id: reqItem.id },
            data: { status: "PAID_COMPLETED" },
          });

          await tx.ledgerEntry.updateMany({
            where: {
              referenceId: reqItem.id,
              type: "SPEND_OPTION_A_PAYPAL",
            },
            data: { status: "COMPLETED" },
          });
        });

        summary.autoResolvedCount += 1;
        continue;
      }

      // Check status alignment
      const isAligned =
        (reqItem.status === "PAID_COMPLETED" &&
          paypalCaptureStatus === "COMPLETED") ||
        (reqItem.status === "PAID_PENDING_CLAIM" &&
          paypalCaptureStatus === "PENDING") ||
        (reqItem.status === "APPROVED" &&
          (orderDetails.status === "CREATED" ||
            orderDetails.status === "APPROVED"));

      if (isAligned) {
        summary.matchedCount += 1;
      } else {
        summary.mismatchesFlaggedCount += 1;
        summary.mismatches.push({
          spendingRequestId: reqItem.id,
          paypalOrderId: reqItem.paypalOrderId,
          localStatus: reqItem.status,
          paypalStatus: paypalCaptureStatus,
          localAmount: reqItem.amount.toString(),
          paypalAmount: paypalAmountStr,
          issue: `STATUS_MISMATCH (local=${reqItem.status}, paypal=${paypalCaptureStatus})`,
        });
      }
    } catch (err) {
      summary.mismatchesFlaggedCount += 1;
      summary.mismatches.push({
        spendingRequestId: reqItem.id,
        paypalOrderId: reqItem.paypalOrderId,
        localStatus: reqItem.status,
        paypalStatus: "FETCH_ERROR",
        localAmount: reqItem.amount.toString(),
        paypalAmount: null,
        issue:
          err instanceof Error ? err.message : "Failed to query PayPal order",
      });
    }
  }

  if (summary.mismatchesFlaggedCount > 0) {
    await writeAuditLog({
      actorRole: "SYSTEM_RECONCILIATION",
      action: "PAYPAL_RECONCILIATION_MISMATCH_FLAGGED",
      targetType: "Reconciliation",
      details: {
        checkedCount: summary.checkedCount,
        mismatchesFlaggedCount: summary.mismatchesFlaggedCount,
        mismatches: summary.mismatches,
      },
    });
  }

  return summary;
}
