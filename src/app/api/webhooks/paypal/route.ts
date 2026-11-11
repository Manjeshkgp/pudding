import { reconcilePurchase } from "@/services/purchase.service";
import { NextRequest } from "next/server";
import { Prisma, SpendingRequestStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import {
  getPayPalCaptureDetails,
  getPayPalOrderDetails,
  getPayPalRefundDetails,
  verifyPayPalWebhookSignature,
} from "@/lib/paypal";
import {
  debitChildBucket,
  getSpendingRequestNetDebitState,
} from "@/services/ledger.service";
import { writeAuditLog } from "@/lib/audit";

interface PayPalWebhookLink {
  href?: string;
  rel?: string;
  method?: string;
}

interface PayPalWebhookResource {
  id?: string;
  custom_id?: string;
  status?: string;
  status_details?: { reason?: string };
  amount?: { currency_code?: string; value?: string };
  seller_payable_breakdown?: {
    gross_amount?: { currency_code?: string; value?: string };
    total_refunded_amount?: { currency_code?: string; value?: string };
  };
  supplementary_data?: {
    related_ids?: {
      order_id?: string;
      capture_id?: string;
    };
  };
  links?: PayPalWebhookLink[];
}

interface PayPalWebhookPayload {
  id: string;
  event_type: string;
  resource?: PayPalWebhookResource;
  summary?: string;
}

const TERMINAL_SPEND_STATUSES: SpendingRequestStatus[] = [
  "REVERSED",
  "REJECTED",
  "CANCELLED",
];

/**
 * Extracts the parent capture ID from a PayPal `PAYMENT.CAPTURE.REFUNDED` resource.
 * Checks `supplementary_data.related_ids.capture_id` first, then falls back to the
 * HATEOAS `up` link (`/v2/payments/captures/{capture_id}`) per PayPal v2 Refunds API spec.
 */
function extractCaptureIdFromRefundResource(
  resource: PayPalWebhookResource,
): string | undefined {
  const fromRelatedIds = resource.supplementary_data?.related_ids?.capture_id;
  if (fromRelatedIds) {
    return fromRelatedIds;
  }

  const upLink = resource.links?.find(
    (l) => l.rel === "up" && l.href?.includes("/v2/payments/captures/"),
  )?.href;

  if (upLink) {
    const match = /\/v2\/payments\/captures\/([^/?#]+)/.exec(upLink);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  return undefined;
}

/**
 * Fail-closed live PayPal verification for `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.PENDING`.
 *
 * - Requires both `paypalOrderId` and `expectedCaptureId` to be present.
 * - Looks up the exact capture by `expectedCaptureId` (never falls back to `captures[0]`).
 * - Requires live status to be `COMPLETED` for a `COMPLETED` event, or `PENDING` for a `PENDING` event.
 * - Fails CLOSED (throws `503 ApiError` so PayPal retries delivery) if the PayPal lookup fails.
 */
async function confirmLivePayPalCaptureAllowsDebit(params: {
  paypalOrderId: string;
  expectedCaptureId: string;
  expectedCurrency: string;
  expectedAmount: Prisma.Decimal;
  webhookEventType: "PAYMENT.CAPTURE.COMPLETED" | "PAYMENT.CAPTURE.PENDING";
}): Promise<{ allowed: boolean; liveStatus: string; reason?: string }> {
  // Query the order details and find the exact capture by ID (never guessing captures[0])
  const orderDetails = await getPayPalOrderDetails(params.paypalOrderId);
  const captures = orderDetails.purchase_units?.[0]?.payments?.captures || [];
  let matchingCapture = captures.find((c) => c.id === params.expectedCaptureId);

  // If the order payload didn't inline the capture, query GET /v2/payments/captures/{id} directly
  if (!matchingCapture) {
    const directCapture = await getPayPalCaptureDetails(
      params.expectedCaptureId,
    );
    const directOrderId =
      directCapture.supplementary_data?.related_ids?.order_id;
    if (directOrderId && directOrderId !== params.paypalOrderId) {
      return {
        allowed: false,
        liveStatus: directCapture.status,
        reason: `Capture ${params.expectedCaptureId} belongs to order ${directOrderId}, not ${params.paypalOrderId}`,
      };
    }
    if (directCapture.amount) {
      matchingCapture = {
        id: directCapture.id,
        status: directCapture.status,
        status_details: directCapture.status_details,
        amount: directCapture.amount,
        custom_id: directCapture.custom_id,
      };
    }
  }

  if (!matchingCapture) {
    return {
      allowed: false,
      liveStatus: "CAPTURE_NOT_FOUND_ON_ORDER",
      reason: `Capture ${params.expectedCaptureId} was not found on PayPal order ${params.paypalOrderId}`,
    };
  }

  const liveCurrency = matchingCapture.amount?.currency_code?.toUpperCase();
  const liveAmount = matchingCapture.amount?.value
    ? new Prisma.Decimal(matchingCapture.amount.value).toDecimalPlaces(2)
    : null;

  if (
    liveCurrency !== params.expectedCurrency.toUpperCase() ||
    !liveAmount ||
    !liveAmount.equals(params.expectedAmount)
  ) {
    return {
      allowed: false,
      liveStatus: matchingCapture.status,
      reason: `Live capture amount/currency (${liveCurrency} ${liveAmount?.toFixed(2)}) does not match request (${params.expectedCurrency} ${params.expectedAmount.toFixed(2)})`,
    };
  }

  const liveStatus = matchingCapture.status;

  if (params.webhookEventType === "PAYMENT.CAPTURE.COMPLETED") {
    if (liveStatus !== "COMPLETED") {
      return {
        allowed: false,
        liveStatus,
        reason: `Expected live capture status COMPLETED for PAYMENT.CAPTURE.COMPLETED, but found ${liveStatus}`,
      };
    }
    return { allowed: true, liveStatus };
  }

  // webhookEventType === "PAYMENT.CAPTURE.PENDING"
  if (liveStatus !== "PENDING") {
    return {
      allowed: false,
      liveStatus,
      reason: `Expected live capture status PENDING for PAYMENT.CAPTURE.PENDING, but found ${liveStatus}`,
    };
  }

  return { allowed: true, liveStatus };
}

/**
 * Fail-closed live PayPal verification for `PAYMENT.CAPTURE.REFUNDED`.
 * Confirms the refund resource via `GET /v2/payments/refunds/{refund_id}` (and/or the webhook's
 * `seller_payable_breakdown.gross_amount` / `amount`) so partial refunds are validated against
 * authoritative PayPal refund data.
 */
async function confirmLivePayPalRefund(params: {
  refundId: string;
  expectedCurrency: string;
  webhookAmount: Prisma.Decimal;
  resource: PayPalWebhookResource;
}): Promise<{
  verified: boolean;
  refundAmount: Prisma.Decimal;
  reason?: string;
}> {
  const liveRefund = await getPayPalRefundDetails(params.refundId);

  if (liveRefund.id !== params.refundId) {
    return {
      verified: false,
      refundAmount: new Prisma.Decimal(0),
      reason: `Refund ID mismatch (${liveRefund.id} !== ${params.refundId})`,
    };
  }

  if (liveRefund.status === "PENDING") {
    throw new ApiError(
      409,
      `Live PayPal refund ${params.refundId} is still PENDING settlement; deferring wallet credit until COMPLETED`,
      "PAYPAL_REFUND_STILL_PENDING",
    );
  }

  if (liveRefund.status !== "COMPLETED") {
    return {
      verified: false,
      refundAmount: new Prisma.Decimal(0),
      reason: `Live PayPal refund ${params.refundId} is not COMPLETED (status: ${liveRefund.status})`,
    };
  }

  const grossOrAmount =
    liveRefund.seller_payable_breakdown?.gross_amount || liveRefund.amount;

  if (!grossOrAmount?.value || !grossOrAmount?.currency_code) {
    return {
      verified: false,
      refundAmount: new Prisma.Decimal(0),
      reason: `Live PayPal refund ${params.refundId} is missing amount/currency`,
    };
  }

  if (
    grossOrAmount.currency_code.toUpperCase() !==
    params.expectedCurrency.toUpperCase()
  ) {
    return {
      verified: false,
      refundAmount: new Prisma.Decimal(0),
      reason: `Live refund currency ${grossOrAmount.currency_code} does not match expected ${params.expectedCurrency}`,
    };
  }

  const authoritativeAmount = new Prisma.Decimal(
    grossOrAmount.value,
  ).toDecimalPlaces(2);

  if (!authoritativeAmount.equals(params.webhookAmount)) {
    return {
      verified: false,
      refundAmount: new Prisma.Decimal(0),
      reason: `Webhook refund amount (${params.webhookAmount.toFixed(2)}) does not match live PayPal refund amount (${authoritativeAmount.toFixed(2)})`,
    };
  }

  return {
    verified: true,
    refundAmount: authoritativeAmount,
  };
}

/**
 * POST /api/webhooks/paypal
 * Receives, cryptographically verifies (INT-3), and deduplicates PayPal webhook events:
 * - `PAYMENT.CAPTURE.COMPLETED`
 * - `PAYMENT.CAPTURE.PENDING`
 * - `PAYMENT.CAPTURE.DENIED`
 * - `PAYMENT.CAPTURE.REVERSED`
 * - `PAYMENT.CAPTURE.REFUNDED`
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = (await req.json()) as PayPalWebhookPayload;

    if (!rawBody || !rawBody.id || !rawBody.event_type) {
      throw new ApiError(
        400,
        "Invalid PayPal webhook payload",
        "INVALID_WEBHOOK",
      );
    }

    // 1. Cryptographically verify PayPal webhook signature FIRST (INT-3).
    // Never store unverified event IDs in `WebhookEvent`, preventing attackers from
    // poisoning/blocking a future legitimate PayPal delivery with the same event ID.
    const isSignatureValid = await verifyPayPalWebhookSignature(
      {
        authAlgo: req.headers.get("paypal-auth-algo"),
        certUrl: req.headers.get("paypal-cert-url"),
        transmissionId: req.headers.get("paypal-transmission-id"),
        transmissionSig: req.headers.get("paypal-transmission-sig"),
        transmissionTime: req.headers.get("paypal-transmission-time"),
      },
      rawBody as unknown as Record<string, unknown>,
    );

    if (!isSignatureValid) {
      await writeAuditLog({
        actorRole: "PAYPAL_WEBHOOK",
        action: "PAYPAL_WEBHOOK_INVALID_SIGNATURE",
        targetType: "WebhookEvent",
        targetId: rawBody.id,
        details: {
          eventType: rawBody.event_type,
        },
      });
      throw new ApiError(
        401,
        "PayPal webhook signature verification failed",
        "INVALID_WEBHOOK_SIGNATURE",
      );
    }

    // 2. Deduplicate verified event (at-least-once delivery INT-3)
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { eventId: rawBody.id },
    });
    if (
      existingEvent &&
      (existingEvent.status === "PROCESSED" ||
        existingEvent.status === "IGNORED")
    ) {
      return apiSuccess(
        { eventId: rawBody.id, deduplicated: true },
        200,
        "Webhook event already processed",
      );
    }

    const eventType = rawBody.event_type;
    const isSupportedCaptureEvent =
      eventType === "PAYMENT.CAPTURE.COMPLETED" ||
      eventType === "PAYMENT.CAPTURE.PENDING" ||
      eventType === "PAYMENT.CAPTURE.DENIED" ||
      eventType === "PAYMENT.CAPTURE.REVERSED" ||
      eventType === "PAYMENT.CAPTURE.REFUNDED";

    if (!isSupportedCaptureEvent) {
      await prisma.webhookEvent.upsert({
        where: { eventId: rawBody.id },
        update: { status: "IGNORED", processedAt: new Date() },
        create: {
          eventId: rawBody.id,
          eventType,
          payload: rawBody as unknown as Prisma.InputJsonValue,
          status: "IGNORED",
        },
      });
      return apiSuccess({ eventId: rawBody.id, ignored: true });
    }

    const resource = rawBody.resource || {};
    const isRefundEvent = eventType === "PAYMENT.CAPTURE.REFUNDED";

    // 3. Require mandatory resource fields on all supported capture/refund events
    const resourceId = resource.id?.trim();
    const rawAmountObj =
      (isRefundEvent &&
        resource.seller_payable_breakdown?.gross_amount?.value &&
        resource.seller_payable_breakdown?.gross_amount) ||
      resource.amount;
    const rawCurrency = rawAmountObj?.currency_code?.trim().toUpperCase();
    const rawAmountValue = rawAmountObj?.value?.trim();

    if (!resourceId || !rawCurrency || !rawAmountValue) {
      throw new ApiError(
        400,
        "PayPal webhook resource is missing required id, amount.value, or amount.currency_code",
        "MALFORMED_WEBHOOK_RESOURCE",
      );
    }

    let parsedEventAmount: Prisma.Decimal;
    try {
      parsedEventAmount = new Prisma.Decimal(rawAmountValue).toDecimalPlaces(2);
    } catch {
      throw new ApiError(
        400,
        `Invalid decimal amount in PayPal webhook: ${rawAmountValue}`,
        "INVALID_WEBHOOK_AMOUNT",
      );
    }

    if (parsedEventAmount.lte(0)) {
      throw new ApiError(
        400,
        "PayPal webhook amount must be greater than zero",
        "INVALID_WEBHOOK_AMOUNT",
      );
    }

    // In REFUNDED events, `resource.id` is the unique refund ID and the parent capture ID MUST
    // be present in `supplementary_data.related_ids.capture_id` or the HATEOAS `up` link (never fall back to `resource.id`).
    const refundId = isRefundEvent ? resourceId : undefined;
    const captureId = isRefundEvent
      ? extractCaptureIdFromRefundResource(resource)
      : resourceId;

    if (!captureId) {
      throw new ApiError(
        400,
        "Refund webhook is missing parent capture_id in supplementary_data.related_ids and HATEOAS links",
        "MISSING_PARENT_CAPTURE_ID",
      );
    }

    const relatedOrderId =
      resource.supplementary_data?.related_ids?.order_id?.trim();
    const customId = resource.custom_id?.trim();

    const demoPurchase = await prisma.purchase.findFirst({
      where: {
        OR: [
          { paypalCaptureId: captureId },
          ...(relatedOrderId ? [{ paypalOrderId: relatedOrderId }] : []),
          ...(customId ? [{ id: customId }] : []),
        ],
      },
    });
    if (demoPurchase) {
      if (
        !demoPurchase.amount.equals(parsedEventAmount) ||
        demoPurchase.currency !== resource.amount?.currency_code
      )
        throw new ApiError(
          409,
          "Webhook amount or currency does not match invoice.",
        );
      if (relatedOrderId && demoPurchase.paypalOrderId !== relatedOrderId)
        throw new ApiError(409, "Webhook order does not match invoice.");
      if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
        const confirmed = await reconcilePurchase(demoPurchase.id);
        if (confirmed.paypalCaptureId !== captureId)
          throw new ApiError(409, "Webhook capture does not match invoice.");
      }
      // Refund/reversal operations are outside the sandbox purchase demo.
      // A completed purchase is never debited again by a later webhook.
      await prisma.webhookEvent.upsert({
        where: { eventId: rawBody.id },
        create: {
          eventId: rawBody.id,
          eventType,
          payload: rawBody as unknown as Prisma.InputJsonValue,
          status:
            eventType === "PAYMENT.CAPTURE.COMPLETED" ? "PROCESSED" : "IGNORED",
        },
        update: {
          status:
            eventType === "PAYMENT.CAPTURE.COMPLETED" ? "PROCESSED" : "IGNORED",
        },
      });
      return apiSuccess({
        eventId: rawBody.id,
        purchaseId: demoPurchase.id,
        processed: true,
      });
    }

    // 4. Locate the matching SpendingRequest (or Charity Donation)
    const spendingRequest = await prisma.spendingRequest.findFirst({
      where: {
        OR: [
          { paypalCaptureId: captureId },
          ...(relatedOrderId ? [{ paypalOrderId: relatedOrderId }] : []),
          ...(customId ? [{ id: customId }] : []),
        ],
      },
      include: {
        family: true,
        child: {
          include: { wallet: true },
        },
      },
    });

    if (!spendingRequest) {
      // Reconcile historical donations only. New donations have been retired.
      const donation = await prisma.donation.findFirst({
        where: {
          OR: [
            { paypalCaptureId: captureId },
            ...(relatedOrderId ? [{ paypalOrderId: relatedOrderId }] : []),
            ...(customId ? [{ id: customId }] : []),
          ],
        },
        include: { family: true },
      });

      if (!donation) {
        // Temporary correlation issue: webhook arrived before local order/request commit finished.
        // Return 409 so PayPal retries delivery rather than permanently marking IGNORED.
        throw new ApiError(
          409,
          `No matching SpendingRequest or Donation found yet for capture ${captureId}`,
          "WEBHOOK_TARGET_NOT_READY",
        );
      }

      const orderMismatch =
        !donation.paypalOrderId ||
        (Boolean(relatedOrderId) && donation.paypalOrderId !== relatedOrderId);
      const currencyMismatch =
        rawCurrency !== donation.family.currency.toUpperCase();
      const amountMismatch = !parsedEventAmount.equals(donation.amount);

      if (
        !orderMismatch &&
        !currencyMismatch &&
        !amountMismatch &&
        eventType === "PAYMENT.CAPTURE.COMPLETED" &&
        donation.status !== "REJECTED" &&
        donation.status !== "FAILED"
      ) {
        await prisma.donation.update({
          where: { id: donation.id },
          data: {
            status: "APPROVED_COMPLETED",
            paypalCaptureId: captureId,
            approvedAt: new Date(),
          },
        });
      }

      await prisma.webhookEvent.upsert({
        where: { eventId: rawBody.id },
        update: {
          status: "PROCESSED",
          processedAt: new Date(),
        },
        create: {
          eventId: rawBody.id,
          eventType: rawBody.event_type,
          payload: rawBody as unknown as Prisma.InputJsonValue,
          status: "PROCESSED",
        },
      });

      return apiSuccess({ eventId: rawBody.id, processed: true });
    }

    // 5. Distinguish Temporary Correlation Race vs. Permanent Mismatch
    if (!spendingRequest.paypalOrderId) {
      // The create-order database update hasn't committed `paypalOrderId` yet; ask PayPal to retry
      throw new ApiError(
        409,
        `SpendingRequest ${spendingRequest.id} does not have a committed paypalOrderId yet`,
        "WEBHOOK_ORDER_CORRELATION_PENDING",
      );
    }

    // Require either `relatedOrderId` or an already-stored `paypalCaptureId` to confirm payment identity
    if (!relatedOrderId && !spendingRequest.paypalCaptureId) {
      throw new ApiError(
        409,
        `Webhook for SpendingRequest ${spendingRequest.id} is missing order_id before capture_id is recorded`,
        "WEBHOOK_CORRELATION_INCOMPLETE",
      );
    }

    const mismatchReasons: string[] = [];

    if (relatedOrderId && spendingRequest.paypalOrderId !== relatedOrderId) {
      mismatchReasons.push(
        `Order ID mismatch (expected ${spendingRequest.paypalOrderId}, got ${relatedOrderId})`,
      );
    }

    if (
      spendingRequest.paypalCaptureId &&
      spendingRequest.paypalCaptureId !== captureId
    ) {
      mismatchReasons.push(
        `Capture ID mismatch (expected ${spendingRequest.paypalCaptureId}, got ${captureId})`,
      );
    }

    const expectedCurrency = spendingRequest.family.currency.toUpperCase();
    if (rawCurrency !== expectedCurrency) {
      mismatchReasons.push(
        `Currency mismatch (expected ${expectedCurrency}, got ${rawCurrency})`,
      );
    }

    if (isRefundEvent) {
      if (parsedEventAmount.gt(spendingRequest.amount)) {
        mismatchReasons.push(
          `Refund amount ${parsedEventAmount.toFixed(2)} exceeds request amount ${spendingRequest.amount.toFixed(2)}`,
        );
      }
    } else if (!parsedEventAmount.equals(spendingRequest.amount)) {
      mismatchReasons.push(
        `Capture amount mismatch (expected ${spendingRequest.amount.toFixed(2)}, got ${parsedEventAmount.toFixed(2)})`,
      );
    }

    if (mismatchReasons.length > 0) {
      const errorMsg = mismatchReasons.join("; ");
      await writeAuditLog({
        familyId: spendingRequest.familyId,
        actorRole: "PAYPAL_WEBHOOK",
        action: "PAYPAL_WEBHOOK_MISMATCH_IGNORED",
        targetType: "SpendingRequest",
        targetId: spendingRequest.id,
        details: {
          eventId: rawBody.id,
          eventType,
          captureId,
          relatedOrderId,
          mismatchReasons,
        },
      });

      await prisma.webhookEvent.upsert({
        where: { eventId: rawBody.id },
        update: {
          status: "IGNORED",
          errorMessage: errorMsg,
          processedAt: new Date(),
        },
        create: {
          eventId: rawBody.id,
          eventType,
          payload: rawBody as unknown as Prisma.InputJsonValue,
          status: "IGNORED",
          errorMessage: errorMsg,
        },
      });

      return apiSuccess(
        {
          eventId: rawBody.id,
          ignored: true,
          reason: errorMsg,
        },
        200,
        "Webhook ignored due to permanent payment verification mismatch",
      );
    }

    // 6. Handle `PAYMENT.CAPTURE.COMPLETED` with Fail-Closed Live Check & Single Atomic Transaction
    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      if (TERMINAL_SPEND_STATUSES.includes(spendingRequest.status)) {
        await writeAuditLog({
          familyId: spendingRequest.familyId,
          actorRole: "PAYPAL_WEBHOOK",
          action: "WEBHOOK_IGNORED_OUT_OF_ORDER_COMPLETED",
          targetType: "SpendingRequest",
          targetId: spendingRequest.id,
          details: {
            eventId: rawBody.id,
            currentStatus: spendingRequest.status,
          },
        });
      } else {
        const liveCheck = await confirmLivePayPalCaptureAllowsDebit({
          paypalOrderId: spendingRequest.paypalOrderId,
          expectedCaptureId: captureId,
          expectedCurrency,
          expectedAmount: spendingRequest.amount,
          webhookEventType: "PAYMENT.CAPTURE.COMPLETED",
        });

        if (!liveCheck.allowed) {
          await writeAuditLog({
            familyId: spendingRequest.familyId,
            actorRole: "PAYPAL_WEBHOOK",
            action: "WEBHOOK_IGNORED_LIVE_STATE_CONFLICT",
            targetType: "SpendingRequest",
            targetId: spendingRequest.id,
            details: {
              eventId: rawBody.id,
              liveStatus: liveCheck.liveStatus,
              reason: liveCheck.reason,
            },
          });
        } else {
          // Single atomic transaction: lock SpendingRequest FOR UPDATE -> check state -> debit or unlock wallet -> update SpendingRequest
          await prisma.$transaction(async (tx) => {
            const lockedReqRows = await tx.$queryRaw<
              Array<{
                id: string;
                status: SpendingRequestStatus;
                paypalCaptureId: string | null;
              }>
            >`SELECT "id", "status", "paypalCaptureId" FROM "SpendingRequest" WHERE "id" = ${spendingRequest.id} FOR UPDATE`;
            const currentReq = lockedReqRows[0];
            if (!currentReq) return;

            if (
              TERMINAL_SPEND_STATUSES.includes(currentReq.status) ||
              currentReq.status === "PAID_COMPLETED"
            ) {
              return;
            }

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
                familyId: spendingRequest.familyId,
                childId: spendingRequest.childId,
                bucket: "SPEND",
                amount: missingDebit,
                idempotencyKey: debitState.activeCycleIdempotencyKey,
                entryType: "SPEND_OPTION_A_PAYPAL",
                status: "COMPLETED",
                referenceId: spendingRequest.id,
                paypalOrderId: spendingRequest.paypalOrderId!,
                paypalCaptureId: captureId,
                description: `PayPal payment to ${spendingRequest.recipientPaypalEmail}: "${spendingRequest.purpose}"`,
                metadata: {
                  cycle: debitState.reversalCount,
                },
              });
            } else if (
              currentReq.status === "PAID_PENDING_CLAIM" &&
              spendingRequest.child.wallet
            ) {
              const lockedWalletRows = await tx.$queryRaw<
                Array<{ id: string; lockedPendingBalance: Prisma.Decimal }>
              >`SELECT "id", "lockedPendingBalance" FROM "Wallet" WHERE "id" = ${spendingRequest.child.wallet.id} FOR UPDATE`;
              const lockedWallet = lockedWalletRows[0];
              const currentLocked = lockedWallet
                ? new Prisma.Decimal(lockedWallet.lockedPendingBalance)
                : new Prisma.Decimal(0);
              const decrementAmt = Prisma.Decimal.min(
                currentLocked,
                spendingRequest.amount,
              );
              if (decrementAmt.gt(0)) {
                await tx.wallet.update({
                  where: { id: spendingRequest.child.wallet.id },
                  data: {
                    lockedPendingBalance: { decrement: decrementAmt },
                  },
                });
              }
            }

            await tx.spendingRequest.update({
              where: { id: spendingRequest.id },
              data: {
                status: "PAID_COMPLETED",
                paypalCaptureId: captureId,
              },
            });
          });
        }
      }
    }

    // 7. Handle `PAYMENT.CAPTURE.PENDING` with Fail-Closed Live Check & Single Atomic Transaction
    else if (eventType === "PAYMENT.CAPTURE.PENDING") {
      if (
        !TERMINAL_SPEND_STATUSES.includes(spendingRequest.status) &&
        spendingRequest.status !== "PAID_COMPLETED"
      ) {
        const liveCheck = await confirmLivePayPalCaptureAllowsDebit({
          paypalOrderId: spendingRequest.paypalOrderId,
          expectedCaptureId: captureId,
          expectedCurrency,
          expectedAmount: spendingRequest.amount,
          webhookEventType: "PAYMENT.CAPTURE.PENDING",
        });

        if (liveCheck.allowed) {
          await prisma.$transaction(async (tx) => {
            const lockedReqRows = await tx.$queryRaw<
              Array<{ id: string; status: SpendingRequestStatus }>
            >`SELECT "id", "status" FROM "SpendingRequest" WHERE "id" = ${spendingRequest.id} FOR UPDATE`;
            const currentReq = lockedReqRows[0];
            if (
              !currentReq ||
              TERMINAL_SPEND_STATUSES.includes(currentReq.status) ||
              currentReq.status === "PAID_COMPLETED"
            ) {
              return;
            }

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
                familyId: spendingRequest.familyId,
                childId: spendingRequest.childId,
                bucket: "SPEND",
                amount: missingDebit,
                idempotencyKey: debitState.activeCycleIdempotencyKey,
                entryType: "SPEND_OPTION_A_PAYPAL",
                status: "COMPLETED",
                lockAsPendingClaim: true,
                referenceId: spendingRequest.id,
                paypalOrderId: spendingRequest.paypalOrderId!,
                paypalCaptureId: captureId,
                description: `PayPal payment to ${spendingRequest.recipientPaypalEmail} (Pending Recipient Claim)`,
                metadata: {
                  captureStatus: "PENDING",
                  pendingReason: resource.status_details?.reason ?? null,
                  cycle: debitState.reversalCount,
                },
              });
            }

            await tx.spendingRequest.update({
              where: { id: spendingRequest.id },
              data: {
                status: "PAID_PENDING_CLAIM",
                paypalCaptureId: captureId,
              },
            });
          });
        }
      }
    }

    // 8. Handle `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REVERSED`, or `PAYMENT.CAPTURE.REFUNDED`
    else if (
      eventType === "PAYMENT.CAPTURE.DENIED" ||
      eventType === "PAYMENT.CAPTURE.REVERSED" ||
      eventType === "PAYMENT.CAPTURE.REFUNDED"
    ) {
      let verifiedRefundAmount = parsedEventAmount;

      if (isRefundEvent) {
        if (!refundId) {
          throw new ApiError(
            400,
            "Refund event is missing unique refund ID",
            "MISSING_REFUND_ID",
          );
        }

        const refundCheck = await confirmLivePayPalRefund({
          refundId,
          expectedCurrency,
          webhookAmount: parsedEventAmount,
          resource,
        });

        if (!refundCheck.verified) {
          await writeAuditLog({
            familyId: spendingRequest.familyId,
            actorRole: "PAYPAL_WEBHOOK",
            action: "WEBHOOK_REFUND_VERIFICATION_REJECTED",
            targetType: "SpendingRequest",
            targetId: spendingRequest.id,
            details: {
              eventId: rawBody.id,
              refundId,
              captureId,
              reason: refundCheck.reason,
            },
          });

          await prisma.webhookEvent.upsert({
            where: { eventId: rawBody.id },
            update: {
              status: "IGNORED",
              errorMessage: refundCheck.reason,
              processedAt: new Date(),
            },
            create: {
              eventId: rawBody.id,
              eventType,
              payload: rawBody as unknown as Prisma.InputJsonValue,
              status: "IGNORED",
              errorMessage: refundCheck.reason,
            },
          });

          return apiSuccess(
            {
              eventId: rawBody.id,
              ignored: true,
              reason: refundCheck.reason,
            },
            200,
            "Refund webhook ignored because live PayPal refund verification did not match",
          );
        }

        verifiedRefundAmount = refundCheck.refundAmount;
      }

      // Per-refund / per-reversal idempotency key so multiple partial refunds are each processed once
      const reversalIdempotencyKey = isRefundEvent
        ? `webhook-refund:${spendingRequest.id}:${refundId}`
        : `webhook-reversal:${spendingRequest.id}:${captureId}`;

      await prisma.$transaction(async (tx) => {
        // Lock the SpendingRequest row FIRST to serialize against concurrent COMPLETED/PENDING/REFUND events
        const lockedReqRows = await tx.$queryRaw<
          Array<{ id: string; status: SpendingRequestStatus }>
        >`SELECT "id", "status" FROM "SpendingRequest" WHERE "id" = ${spendingRequest.id} FOR UPDATE`;
        const lockedReq = lockedReqRows[0];
        if (!lockedReq) return;

        const existingReversal = await tx.ledgerEntry.findUnique({
          where: { idempotencyKey: reversalIdempotencyKey },
        });
        if (existingReversal) {
          return;
        }

        // Calculate total debited vs. total already restored on the immutable ledger
        const [debitAgg, reversalAgg] = await Promise.all([
          tx.ledgerEntry.aggregate({
            where: {
              referenceId: spendingRequest.id,
              type: "SPEND_OPTION_A_PAYPAL",
              direction: "DEBIT",
            },
            _sum: { amount: true },
          }),
          tx.ledgerEntry.aggregate({
            where: {
              referenceId: spendingRequest.id,
              type: "REVERSAL",
              direction: "CREDIT",
            },
            _sum: { amount: true },
          }),
        ]);

        const totalDebited = debitAgg._sum.amount ?? new Prisma.Decimal(0);
        const totalRestoredSoFar =
          reversalAgg._sum.amount ?? new Prisma.Decimal(0);
        const netDebitedRemaining = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          totalDebited.minus(totalRestoredSoFar),
        );

        // If a REFUNDED event arrives before the synchronous/webhook DEBIT has been recorded,
        // throw 409 so PayPal retries after the capture debit is committed.
        if (isRefundEvent && totalDebited.eq(0)) {
          throw new ApiError(
            409,
            `Refund ${refundId} arrived before capture debit was recorded for SpendingRequest ${spendingRequest.id}`,
            "REFUND_BEFORE_DEBIT_RETRY",
          );
        }

        const requestedRestore = isRefundEvent
          ? verifiedRefundAmount
          : netDebitedRemaining;

        const amountToRestore = Prisma.Decimal.min(
          requestedRestore,
          netDebitedRemaining,
        ).toDecimalPlaces(2);

        if (amountToRestore.gt(0) && spendingRequest.child.wallet) {
          const lockedWalletRows = await tx.$queryRaw<
            Array<{ id: string; lockedPendingBalance: Prisma.Decimal }>
          >`SELECT "id", "lockedPendingBalance" FROM "Wallet" WHERE "id" = ${spendingRequest.child.wallet.id} FOR UPDATE`;
          const lockedWallet = lockedWalletRows[0];

          const currentLocked = lockedWallet
            ? new Prisma.Decimal(lockedWallet.lockedPendingBalance)
            : new Prisma.Decimal(0);
          const lockedToClear =
            lockedReq.status === "PAID_PENDING_CLAIM"
              ? Prisma.Decimal.min(currentLocked, amountToRestore)
              : new Prisma.Decimal(0);

          // Restore the child's virtual Spend balance
          await tx.wallet.update({
            where: { id: spendingRequest.child.wallet.id },
            data: {
              spendBalance: { increment: amountToRestore },
              ...(lockedToClear.gt(0)
                ? { lockedPendingBalance: { decrement: lockedToClear } }
                : {}),
            },
          });

          // Record an immutable compensating CREDIT entry (never mutating the original DEBIT row)
          await tx.ledgerEntry.create({
            data: {
              familyId: spendingRequest.familyId,
              childId: spendingRequest.childId,
              walletBucket: "SPEND",
              amount: amountToRestore,
              direction: "CREDIT",
              type: "REVERSAL",
              status: "COMPLETED",
              idempotencyKey: reversalIdempotencyKey,
              referenceId: spendingRequest.id,
              paypalOrderId: relatedOrderId ?? spendingRequest.paypalOrderId,
              paypalCaptureId: captureId,
              description: `Restored $${amountToRestore.toFixed(2)} to Spend bucket (${eventType} for ${spendingRequest.recipientPaypalEmail})`,
              metadata: {
                eventId: rawBody.id,
                eventType,
                refundId: refundId ?? null,
                isPartialRefund: amountToRestore.lt(spendingRequest.amount),
              },
            },
          });
        }

        const totalRestoredAfter = totalRestoredSoFar.plus(amountToRestore);
        const isFullyRestored =
          totalDebited.gt(0) && totalRestoredAfter.gte(totalDebited);

        let nextStatus: SpendingRequestStatus = lockedReq.status;
        if (eventType === "PAYMENT.CAPTURE.DENIED") {
          nextStatus = totalDebited.gt(0) ? "REVERSED" : "PAYMENT_FAILED";
        } else if (!isRefundEvent || isFullyRestored || totalDebited.eq(0)) {
          nextStatus = "REVERSED";
        }

        if (nextStatus !== lockedReq.status) {
          await tx.spendingRequest.update({
            where: { id: spendingRequest.id },
            data: {
              status: nextStatus,
              paypalCaptureId: captureId,
            },
          });
        }

        // Send accurate notifications based on whether funds were actually deducted & restored
        if (amountToRestore.gt(0)) {
          await tx.notification.createMany({
            data: [
              {
                familyId: spendingRequest.familyId,
                type: "PAYPAL_PAYMENT_REVERSED",
                title: "PayPal Payment Reversed / Restored",
                message: `The $${amountToRestore.toFixed(2)} PayPal payment to ${spendingRequest.recipientPaypalEmail} was ${eventType.split(".").pop()?.toLowerCase()}. ${spendingRequest.child.name}'s virtual wallet balance has been automatically restored by $${amountToRestore.toFixed(2)}.`,
                metadata: {
                  spendingRequestId: spendingRequest.id,
                  eventType,
                  amountRestored: amountToRestore.toString(),
                },
                channel: "IN_APP",
              },
              {
                familyId: spendingRequest.familyId,
                childId: spendingRequest.childId,
                type: "CHILD_SPEND_RESTORED",
                title: "Money Returned to Your Wallet",
                message: `$${amountToRestore.toFixed(2)} for "${spendingRequest.purpose}" was returned to your Spend bucket because the PayPal transfer was ${eventType.split(".").pop()?.toLowerCase()}.`,
                channel: "IN_APP",
              },
            ],
          });
        } else if (totalDebited.eq(0)) {
          await tx.notification.create({
            data: {
              familyId: spendingRequest.familyId,
              type: "PAYPAL_PAYMENT_FAILED",
              title: "PayPal Payment Declined",
              message: `The $${spendingRequest.amount.toFixed(2)} PayPal payment to ${spendingRequest.recipientPaypalEmail} was ${eventType.split(".").pop()?.toLowerCase()}. No funds were deducted from ${spendingRequest.child.name}'s wallet.`,
              metadata: {
                spendingRequestId: spendingRequest.id,
                eventType,
                amountRestored: "0.00",
              },
              channel: "IN_APP",
            },
          });
        }

        await writeAuditLog(
          {
            familyId: spendingRequest.familyId,
            actorRole: "PAYPAL_WEBHOOK",
            action: `WEBHOOK_${eventType}`,
            targetType: "SpendingRequest",
            targetId: spendingRequest.id,
            details: {
              eventId: rawBody.id,
              captureId,
              refundId: refundId ?? null,
              hadPriorDebit: totalDebited.gt(0),
              amountRestored: amountToRestore.toString(),
              nextStatus,
            },
          },
          tx,
        );
      });
    }

    await prisma.webhookEvent.upsert({
      where: { eventId: rawBody.id },
      update: {
        status: "PROCESSED",
        errorMessage: null,
        processedAt: new Date(),
      },
      create: {
        eventId: rawBody.id,
        eventType: rawBody.event_type,
        payload: rawBody as unknown as Prisma.InputJsonValue,
        status: "PROCESSED",
      },
    });

    return apiSuccess(
      { eventId: rawBody.id, eventType: rawBody.event_type, processed: true },
      200,
      "Webhook processed successfully",
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
