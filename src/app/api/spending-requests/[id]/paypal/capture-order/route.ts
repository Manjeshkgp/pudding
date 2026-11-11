import { NextRequest } from "next/server";
import { Prisma, SpendingRequestStatus } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import {
  capturePayPalOrder,
  getPayPalOrderDetails,
  PayPalOrderResponse,
} from "@/lib/paypal";
import {
  debitChildBucket,
  getSpendingRequestNetDebitState,
} from "@/services/ledger.service";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const captureOrderSchema = z.object({
  paypalOrderId: z.string().trim().min(5).optional(),
  idempotencyKey: z.string().trim().min(4).max(128).optional(),
});

const CAPTURABLE_STATUSES: SpendingRequestStatus[] = [
  "APPROVED",
  "PENDING_APPROVAL",
  "PAYMENT_FAILED",
];

/**
 * Releases a preflight Spend reservation ONLY after we have authoritatively confirmed with PayPal
 * that the capture was `DECLINED`, `FAILED`, or never created on the order.
 *
 * Uses `getSpendingRequestNetDebitState` under the `SpendingRequest` row lock so:
 * - It restores `netDebited` (`amountToRestore = min(amount, netDebited)`) and increments `reversalCount`.
 * - A subsequent retry sees `netDebited === 0` and a new `activeCycleIdempotencyKey` (`cycle-${reversalCount}`),
 *   allowing the retry to cleanly re-reserve the child's funds.
 */
async function releasePreflightReservationOnConfirmedFailure(params: {
  spendingRequestId: string;
  familyId: string;
  childId: string;
  amount: Prisma.Decimal;
  orderIdToCapture: string;
  captureId: string | null;
  markPaymentFailed: boolean;
  recipientPaypalEmail: string | null;
  reason: string;
}) {
  await prisma.$transaction(async (tx) => {
    const lockedReqRows = await tx.$queryRaw<
      Array<{
        id: string;
        status: SpendingRequestStatus;
        paypalCaptureId: string | null;
      }>
    >`SELECT "id", "status", "paypalCaptureId" FROM "SpendingRequest" WHERE "id" = ${params.spendingRequestId} FOR UPDATE`;
    const currentReq = lockedReqRows[0];

    // Never undo a debit if a concurrent webhook already finalized the payment
    if (!currentReq || currentReq.status === "PAID_COMPLETED") {
      return;
    }

    const debitState = await getSpendingRequestNetDebitState(
      tx,
      params.spendingRequestId,
    );
    const amountToRestore = Prisma.Decimal.min(
      params.amount,
      debitState.netDebited,
    ).toDecimalPlaces(2);

    if (amountToRestore.gt(0)) {
      const lockedWalletRows = await tx.$queryRaw<
        Array<{ id: string; lockedPendingBalance: Prisma.Decimal }>
      >`SELECT "id", "lockedPendingBalance" FROM "Wallet" WHERE "childId" = ${params.childId} FOR UPDATE`;
      const lockedWallet = lockedWalletRows[0];

      if (lockedWallet) {
        const currentLocked = new Prisma.Decimal(
          lockedWallet.lockedPendingBalance,
        );
        const lockedToClear = Prisma.Decimal.min(
          currentLocked,
          amountToRestore,
        );

        await tx.wallet.update({
          where: { id: lockedWallet.id },
          data: {
            spendBalance: { increment: amountToRestore },
            ...(lockedToClear.gt(0)
              ? { lockedPendingBalance: { decrement: lockedToClear } }
              : {}),
          },
        });

        await tx.ledgerEntry.create({
          data: {
            familyId: params.familyId,
            childId: params.childId,
            walletBucket: "SPEND",
            amount: amountToRestore,
            direction: "CREDIT",
            type: "REVERSAL",
            status: "COMPLETED",
            idempotencyKey: debitState.activeCycleReleaseKey,
            referenceId: params.spendingRequestId,
            paypalOrderId: params.orderIdToCapture,
            paypalCaptureId: params.captureId,
            description: `Released reserved $${amountToRestore.toFixed(2)} to Spend bucket (${params.reason})`,
            metadata: {
              reason: params.reason,
              paypalOrderId: params.orderIdToCapture,
              cycle: debitState.reversalCount,
            },
          },
        });
      }
    }

    if (params.markPaymentFailed) {
      await tx.spendingRequest.update({
        where: { id: params.spendingRequestId },
        data: {
          status: "PAYMENT_FAILED",
          paypalOrderId: params.orderIdToCapture,
          paypalCaptureId: null,
        },
      });

      await tx.notification.create({
        data: {
          familyId: params.familyId,
          type: "PAYPAL_PAYMENT_FAILED",
          title: "PayPal Payment Failed",
          message: `The $${params.amount.toFixed(2)} PayPal payment to ${params.recipientPaypalEmail} was declined. Reserved wallet funds have been released.`,
          channel: "IN_APP",
        },
      });
    } else if (currentReq.status === "PAID_PENDING_CLAIM") {
      // Revert back to APPROVED so the parent can retry capturing the order
      await tx.spendingRequest.update({
        where: { id: params.spendingRequestId },
        data: {
          status: "APPROVED",
          paypalOrderId: params.orderIdToCapture,
          paypalCaptureId: null,
        },
      });
    }
  });
}

/**
 * POST /api/spending-requests/[id]/paypal/capture-order
 * Called immediately after the Parent completes the PayPal Checkout popup (`onApprove`).
 *
 * Uses a cycle-aware 2-phase reservation & PayPal reconciliation pattern:
 * 1. Pre-flight Transaction (`FOR UPDATE` on `SpendingRequest` & `Wallet`):
 *    - Rejects terminal/cancelled/rejected requests before calling PayPal.
 *    - Checks `getSpendingRequestNetDebitState`: if `netDebited < amount` (including after a prior released attempt),
 *      atomically reserves the child's funds using `activeCycleIdempotencyKey` (`spend-option-a-debit:${id}:cycle-${reversalCount}`).
 * 2. External PayPal Capture Call + Outcome Reconciliation (`capturePayPalOrder` -> `getPayPalOrderDetails`):
 *    - If `capturePayPalOrder` throws a network error or timeout, queries `getPayPalOrderDetails(orderIdToCapture)`:
 *      * If PayPal actually captured the order (`COMPLETED` or `PENDING`), recovers and finalizes using that capture!
 *      * If PayPal confirms no capture occurred (`CREATED`/`APPROVED` with no captures, or `DECLINED`/`FAILED`),
 *        releases the reserved funds back to `spendBalance`.
 *      * If `getPayPalOrderDetails` also fails (outcome is ambiguous), keeps the reservation locked (`PAID_PENDING_CLAIM` + `lockedPendingBalance`)
 *        and returns `503 PAYPAL_CAPTURE_OUTCOME_AMBIGUOUS` so neither retries nor webhooks can lose the reserved funds.
 * 3. Finalization Transaction (`FOR UPDATE` on `SpendingRequest` & `Wallet`):
 *    - If PayPal returned `COMPLETED`: ensures `netDebited >= amount`, clears `lockedPendingBalance`, and marks `PAID_COMPLETED`.
 *    - If PayPal returned `PENDING` (`UNCLAIMED`): keeps `lockedPendingBalance` and `PAID_PENDING_CLAIM` with `paypalCaptureId`.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: requestId } = await context.params;
    const { user, family } = await requireParent(req, "canApproveSpending");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, captureOrderSchema);

    // 1. Pre-flight reservation under row locks BEFORE calling PayPal's capture API
    const preflight = await prisma.$transaction(async (tx) => {
      const lockedReqRows = await tx.$queryRaw<
        Array<{
          id: string;
          familyId: string;
          childId: string;
          amount: Prisma.Decimal;
          purpose: string;
          optionType: string;
          recipientPaypalEmail: string | null;
          status: SpendingRequestStatus;
          paypalOrderId: string | null;
          paypalCaptureId: string | null;
        }>
      >`SELECT "id", "familyId", "childId", "amount", "purpose", "optionType", "recipientPaypalEmail", "status", "paypalOrderId", "paypalCaptureId" FROM "SpendingRequest" WHERE "id" = ${requestId} FOR UPDATE`;

      const lockedReq = lockedReqRows[0];
      if (!lockedReq || lockedReq.familyId !== family.id) {
        throw new ApiError(
          404,
          "Spending request not found in your family",
          "REQUEST_NOT_FOUND",
        );
      }

      if (lockedReq.optionType !== "OPTION_A_PAYPAL_EMAIL") {
        throw new ApiError(
          400,
          "Only Option A (PayPal Email) requests can be captured via PayPal",
          "INVALID_OPTION_TYPE",
        );
      }

      const wallet = await tx.wallet.findUnique({
        where: { childId: lockedReq.childId },
      });

      // Idempotent return if already captured (has paypalCaptureId or is PAID_COMPLETED)
      if (
        lockedReq.status === "PAID_COMPLETED" ||
        (lockedReq.status === "PAID_PENDING_CLAIM" &&
          Boolean(lockedReq.paypalCaptureId))
      ) {
        const fullReq = await tx.spendingRequest.findUniqueOrThrow({
          where: { id: lockedReq.id },
        });
        return {
          alreadyPaid: true as const,
          spendingRequest: fullReq,
          wallet,
        };
      }

      // Refuse BEFORE calling PayPal if the request is in any non-capturable/terminal state
      if (
        !CAPTURABLE_STATUSES.includes(lockedReq.status) &&
        lockedReq.status !== "PAID_PENDING_CLAIM"
      ) {
        throw new ApiError(
          409,
          `Spending request cannot be captured in status ${lockedReq.status}`,
          "SPENDING_REQUEST_TERMINAL",
        );
      }

      const resolvedOrderId = input.paypalOrderId || lockedReq.paypalOrderId;

      if (!resolvedOrderId) {
        throw new ApiError(
          400,
          "No PayPal order ID found for this spending request. Call create-order first.",
          "MISSING_PAYPAL_ORDER_ID",
        );
      }

      if (
        lockedReq.paypalOrderId &&
        input.paypalOrderId &&
        lockedReq.paypalOrderId !== input.paypalOrderId
      ) {
        throw new ApiError(
          409,
          "Provided paypalOrderId does not match the spending request's active PayPal order",
          "PAYPAL_ORDER_ID_MISMATCH",
        );
      }

      // Check authoritative net debit state (`totalDebited - totalRestored`).
      // If `netDebited < lockedReq.amount` (either first attempt OR a retry after a prior released attempt),
      // reserve the remaining amount using the cycle-scoped idempotency key!
      const debitState = await getSpendingRequestNetDebitState(
        tx,
        lockedReq.id,
      );
      const amountNeededToReserve = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        lockedReq.amount.minus(debitState.netDebited),
      ).toDecimalPlaces(2);

      if (amountNeededToReserve.gt(0)) {
        await debitChildBucket({
          tx,
          familyId: family.id,
          childId: lockedReq.childId,
          bucket: "SPEND",
          amount: amountNeededToReserve,
          idempotencyKey: debitState.activeCycleIdempotencyKey,
          entryType: "SPEND_OPTION_A_PAYPAL",
          status: "COMPLETED",
          lockAsPendingClaim: true,
          referenceId: lockedReq.id,
          paypalOrderId: resolvedOrderId,
          actorUserId: user.id,
          description: `PayPal payment to ${lockedReq.recipientPaypalEmail}: "${lockedReq.purpose}"`,
          metadata: {
            recipientPaypalEmail: lockedReq.recipientPaypalEmail,
            captureStatus: "PREFLIGHT_RESERVED",
            cycle: debitState.reversalCount,
          },
        });
      }

      await tx.spendingRequest.update({
        where: { id: lockedReq.id },
        data: {
          status: "PAID_PENDING_CLAIM",
          paypalOrderId: resolvedOrderId,
          reviewedByUserId: user.id,
        },
      });

      return {
        alreadyPaid: false as const,
        spendingRequest: lockedReq,
        orderIdToCapture: resolvedOrderId,
      };
    });

    if (preflight.alreadyPaid) {
      return apiSuccess(
        {
          spendingRequest: {
            ...preflight.spendingRequest,
            amount: preflight.spendingRequest.amount.toString(),
          },
          wallet: preflight.wallet
            ? {
                spendBalance: preflight.wallet.spendBalance.toString(),
                saveBalance: preflight.wallet.saveBalance.toString(),

                lockedPendingBalance:
                  preflight.wallet.lockedPendingBalance.toString(),
              }
            : null,
          idempotentReplay: true,
        },
        200,
        "PayPal order already captured",
      );
    }

    const { spendingRequest, orderIdToCapture } = preflight;

    const idempotencyKey =
      input.idempotencyKey ||
      req.headers.get("x-idempotency-key") ||
      `paypal-capture:${spendingRequest.id}:${orderIdToCapture}`;

    // 2. Capture the PayPal Order.
    // If `capturePayPalOrder` throws (e.g., network timeout or 5xx), reconcile with `getPayPalOrderDetails`
    // BEFORE deciding whether to release the reserved funds!
    let captureResponse: PayPalOrderResponse;
    try {
      captureResponse = await capturePayPalOrder(
        orderIdToCapture,
        idempotencyKey,
      );
    } catch (captureErr) {
      let reconciledOrder: PayPalOrderResponse | null = null;
      try {
        reconciledOrder = await getPayPalOrderDetails(orderIdToCapture);
      } catch {
        // PayPal is unreachable so the capture outcome is ambiguous.
        // Keep the reservation locked (`PAID_PENDING_CLAIM` + `lockedPendingBalance`) so if PayPal did capture,
        // the webhook or a retry will finalize it without losing the reserved funds.
        throw new ApiError(
          503,
          "PayPal capture outcome could not be verified due to a temporary network error. Funds remain safely reserved while awaiting PayPal confirmation.",
          "PAYPAL_CAPTURE_OUTCOME_AMBIGUOUS",
        );
      }

      const reconciledCaptures =
        reconciledOrder.purchase_units?.[0]?.payments?.captures || [];
      const activeCapture = reconciledCaptures.find(
        (c) => c.status === "COMPLETED" || c.status === "PENDING",
      );

      if (activeCapture) {
        // PayPal actually captured the order before the HTTP response timed out! Recover and finalize.
        captureResponse = reconciledOrder;
      } else {
        // Authoritatively confirmed: PayPal has NO active capture on this order (`captures` is empty or DECLINED/FAILED).
        const failedCapture = reconciledCaptures[0];
        const isDeclined =
          failedCapture?.status === "DECLINED" ||
          failedCapture?.status === "FAILED";

        await releasePreflightReservationOnConfirmedFailure({
          spendingRequestId: spendingRequest.id,
          familyId: family.id,
          childId: spendingRequest.childId,
          amount: spendingRequest.amount,
          orderIdToCapture,
          captureId: failedCapture?.id ?? null,
          markPaymentFailed: isDeclined,
          recipientPaypalEmail: spendingRequest.recipientPaypalEmail,
          reason: isDeclined
            ? `PayPal capture ${failedCapture.status.toLowerCase()}`
            : "PayPal order confirmed uncaptured after capture API error",
        });

        throw captureErr;
      }
    }

    const firstUnit = captureResponse.purchase_units?.[0];
    const captureObj = firstUnit?.payments?.captures?.[0];
    const captureId = captureObj?.id?.trim() || null;
    const captureStatus = captureObj?.status || captureResponse.status;
    const pendingReason = captureObj?.status_details?.reason;

    if (captureStatus === "DECLINED" || captureStatus === "FAILED") {
      await releasePreflightReservationOnConfirmedFailure({
        spendingRequestId: spendingRequest.id,
        familyId: family.id,
        childId: spendingRequest.childId,
        amount: spendingRequest.amount,
        orderIdToCapture,
        captureId,
        markPaymentFailed: true,
        recipientPaypalEmail: spendingRequest.recipientPaypalEmail,
        reason: `PayPal capture ${captureStatus.toLowerCase()}`,
      });

      throw new ApiError(
        402,
        "PayPal payment was declined by the funding source",
        "PAYPAL_CAPTURE_DECLINED",
      );
    }

    if (!captureId) {
      throw new ApiError(
        502,
        "PayPal capture response is missing the capture ID",
        "MISSING_PAYPAL_CAPTURE_ID",
      );
    }

    const isPendingClaim = captureStatus === "PENDING";

    // 3. Finalize the reservation under a row lock:
    // - If COMPLETED: ensure `netDebited >= amount`, release `lockedPendingBalance` (funds are now permanently spent), and mark `PAID_COMPLETED`.
    // - If PENDING (`UNCLAIMED`): keep `lockedPendingBalance` and `PAID_PENDING_CLAIM`, and record `paypalCaptureId`.
    const txOutcome = await prisma.$transaction(async (tx) => {
      const lockedReqRows = await tx.$queryRaw<
        Array<{ id: string; status: SpendingRequestStatus }>
      >`SELECT "id", "status" FROM "SpendingRequest" WHERE "id" = ${spendingRequest.id} FOR UPDATE`;
      const currentReq = lockedReqRows[0];

      // If a concurrent REVERSED/REFUNDED webhook already settled and reversed the payment, preserve REVERSED
      if (currentReq?.status === "REVERSED") {
        const finalReq = await tx.spendingRequest.findUniqueOrThrow({
          where: { id: spendingRequest.id },
        });
        const finalWallet = await tx.wallet.findUniqueOrThrow({
          where: { childId: spendingRequest.childId },
        });
        return {
          alreadyReversedByWebhook: true as const,
          updatedRequest: finalReq,
          wallet: finalWallet,
        };
      }

      // Defense-in-depth: ensure the request has a full net debit before finalizing
      const debitState = await getSpendingRequestNetDebitState(
        tx,
        spendingRequest.id,
      );
      const missingDebit = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        spendingRequest.amount.minus(debitState.netDebited),
      ).toDecimalPlaces(2);

      if (missingDebit.gt(0)) {
        await debitChildBucket({
          tx,
          familyId: family.id,
          childId: spendingRequest.childId,
          bucket: "SPEND",
          amount: missingDebit,
          idempotencyKey: debitState.activeCycleIdempotencyKey,
          entryType: "SPEND_OPTION_A_PAYPAL",
          status: "COMPLETED",
          lockAsPendingClaim: isPendingClaim,
          referenceId: spendingRequest.id,
          paypalOrderId: orderIdToCapture,
          paypalCaptureId: captureId,
          actorUserId: user.id,
          description: isPendingClaim
            ? `PayPal payment to ${spendingRequest.recipientPaypalEmail} (Pending Recipient Claim)`
            : `PayPal payment to ${spendingRequest.recipientPaypalEmail}: "${spendingRequest.purpose}"`,
          metadata: {
            recipientPaypalEmail: spendingRequest.recipientPaypalEmail,
            captureStatus,
            pendingReason,
            cycle: debitState.reversalCount,
          },
        });
      }

      const lockedWalletRows = await tx.$queryRaw<
        Array<{ id: string; lockedPendingBalance: Prisma.Decimal }>
      >`SELECT "id", "lockedPendingBalance" FROM "Wallet" WHERE "childId" = ${spendingRequest.childId} FOR UPDATE`;
      const lockedWallet = lockedWalletRows[0];

      let updatedWallet;
      if (
        !isPendingClaim &&
        lockedWallet &&
        currentReq?.status === "PAID_PENDING_CLAIM" &&
        missingDebit.eq(0)
      ) {
        const currentLocked = new Prisma.Decimal(
          lockedWallet.lockedPendingBalance,
        );
        const decrementAmt = Prisma.Decimal.min(
          currentLocked,
          spendingRequest.amount,
        );
        updatedWallet = decrementAmt.gt(0)
          ? await tx.wallet.update({
              where: { id: lockedWallet.id },
              data: {
                lockedPendingBalance: { decrement: decrementAmt },
              },
            })
          : await tx.wallet.findUniqueOrThrow({
              where: { id: lockedWallet.id },
            });
      } else {
        updatedWallet = await tx.wallet.findUniqueOrThrow({
          where: { childId: spendingRequest.childId },
        });
      }

      const targetStatus: SpendingRequestStatus =
        currentReq?.status === "PAID_COMPLETED"
          ? "PAID_COMPLETED"
          : isPendingClaim
            ? "PAID_PENDING_CLAIM"
            : "PAID_COMPLETED";

      const updatedReq = await tx.spendingRequest.update({
        where: { id: spendingRequest.id },
        data: {
          status: targetStatus,
          paypalOrderId: orderIdToCapture,
          paypalCaptureId: captureId,
          reviewedByUserId: user.id,
        },
      });

      return {
        alreadyReversedByWebhook: false as const,
        updatedRequest: updatedReq,
        wallet: updatedWallet,
      };
    });

    const { updatedRequest, wallet: finalWallet } = txOutcome;

    if (!txOutcome.alreadyReversedByWebhook) {
      await prisma.notification.createMany({
        data: [
          {
            familyId: family.id,
            childId: spendingRequest.childId,
            type: isPendingClaim
              ? "SPEND_PAID_PENDING_CLAIM"
              : "SPEND_PAID_COMPLETED",
            title: isPendingClaim
              ? "Payment Sent (Waiting for Recipient)"
              : "Payment Sent!",
            message: isPendingClaim
              ? `$${spendingRequest.amount.toFixed(2)} was sent to ${spendingRequest.recipientPaypalEmail} and is waiting for them to claim it on PayPal.`
              : `${user.name} sent $${spendingRequest.amount.toFixed(2)} to ${spendingRequest.recipientPaypalEmail} for "${spendingRequest.purpose}"!`,
            channel: "IN_APP",
          },
        ],
      });
    }

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: isPendingClaim
        ? "PAYPAL_ORDER_CAPTURED_PENDING_CLAIM"
        : "PAYPAL_ORDER_CAPTURED_COMPLETED",
      targetType: "SpendingRequest",
      targetId: updatedRequest.id,
      details: {
        paypalOrderId: orderIdToCapture,
        paypalCaptureId: captureId,
        captureStatus,
        pendingReason,
        amount: updatedRequest.amount.toString(),
        recipientPaypalEmail: updatedRequest.recipientPaypalEmail,
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      {
        spendingRequest: {
          ...updatedRequest,
          amount: updatedRequest.amount.toString(),
        },
        captureId,
        captureStatus,
        pendingReason: pendingReason ?? null,
        wallet: {
          spendBalance: finalWallet.spendBalance.toString(),
          saveBalance: finalWallet.saveBalance.toString(),

          lockedPendingBalance: finalWallet.lockedPendingBalance.toString(),
        },
      },
      200,
      isPendingClaim
        ? `Payment sent to ${spendingRequest.recipientPaypalEmail} (Pending recipient claim on PayPal)`
        : `Payment of $${spendingRequest.amount.toFixed(2)} to ${spendingRequest.recipientPaypalEmail} completed!`,
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
