import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { verifyPayPalWebhookSignature } from "@/lib/paypal";
import prisma from "@/lib/prisma";
import { reconcilePurchase } from "@/services/purchase.service";
import { syncSubscriptionWebhook } from "@/services/paypal-subscription.service";

const subscriptionEvents = new Set([
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
]);

interface PayPalWebhookPayload {
  id: string;
  event_type: string;
  resource?: {
    id?: string;
    custom_id?: string;
    billing_agreement_id?: string;
    amount?: { currency_code?: string; value?: string };
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
}

export async function POST(req: NextRequest) {
  try {
    const event = (await req.json().catch(() => null)) as
      | PayPalWebhookPayload
      | null;
    if (
      !event ||
      typeof event.id !== "string" ||
      !event.id ||
      typeof event.event_type !== "string" ||
      !event.event_type
    ) {
      throw new ApiError(400, "Invalid PayPal webhook payload", "INVALID_WEBHOOK");
    }

    const verified = await verifyPayPalWebhookSignature(
      {
        authAlgo: req.headers.get("paypal-auth-algo"),
        certUrl: req.headers.get("paypal-cert-url"),
        transmissionId: req.headers.get("paypal-transmission-id"),
        transmissionSig: req.headers.get("paypal-transmission-sig"),
        transmissionTime: req.headers.get("paypal-transmission-time"),
      },
      event as unknown as Record<string, unknown>,
    );
    if (!verified) {
      await writeAuditLog({
        actorRole: "PAYPAL_WEBHOOK",
        action: "PAYPAL_WEBHOOK_INVALID_SIGNATURE",
        targetType: "WebhookEvent",
        targetId: event.id,
        details: { eventType: event.event_type },
      });
      throw new ApiError(
        401,
        "PayPal webhook signature verification failed",
        "INVALID_WEBHOOK_SIGNATURE",
      );
    }

    const prior = await prisma.webhookEvent.findUnique({
      where: { eventId: event.id },
      select: { status: true },
    });
    if (prior?.status === "PROCESSED" || prior?.status === "IGNORED")
      return apiSuccess({ eventId: event.id, deduplicated: true });

    let status: "PROCESSED" | "IGNORED" = "IGNORED";
    let purchaseId: string | undefined;
    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      const capture = event.resource;
      const captureId = capture?.id?.trim();
      const currency = capture?.amount?.currency_code?.trim().toUpperCase();
      const value = capture?.amount?.value?.trim();
      if (!capture || !captureId || !currency || !value || !/^\d+(\.\d{1,2})?$/.test(value))
        throw new ApiError(
          400,
          "PayPal capture is missing a valid ID, currency, or amount.",
          "MALFORMED_WEBHOOK_RESOURCE",
        );
      const amount = new Prisma.Decimal(value);
      if (amount.lte(0))
        throw new ApiError(400, "PayPal capture amount must be positive.", "INVALID_WEBHOOK_AMOUNT");

      const orderId = capture.supplementary_data?.related_ids?.order_id?.trim();
      const customId = capture.custom_id?.trim();
      const purchase = await prisma.purchase.findFirst({
        where: {
          OR: [
            { paypalCaptureId: captureId },
            ...(orderId ? [{ paypalOrderId: orderId }] : []),
            ...(customId ? [{ id: customId }] : []),
          ],
        },
      });
      if (!purchase?.paypalOrderId)
        throw new ApiError(
          409,
          "The PayPal capture does not yet match a recorded purchase.",
          "WEBHOOK_TARGET_NOT_READY",
        );
      if (
        !purchase.amount.equals(amount) ||
        purchase.currency !== currency ||
        (orderId && orderId !== purchase.paypalOrderId) ||
        (purchase.paypalCaptureId && purchase.paypalCaptureId !== captureId)
      )
        throw new ApiError(
          409,
          "PayPal capture does not match the purchase.",
          "WEBHOOK_CAPTURE_MISMATCH",
        );

      // Reconciliation fetches the order from PayPal and finalizes it atomically.
      const confirmed = await reconcilePurchase(purchase.id, captureId);
      if (confirmed.paypalCaptureId !== captureId)
        throw new ApiError(
          409,
          "PayPal capture does not match the confirmed order.",
          "WEBHOOK_CAPTURE_MISMATCH",
        );
      purchaseId = purchase.id;
      status = "PROCESSED";
    } else if (subscriptionEvents.has(event.event_type) || event.event_type === "PAYMENT.SALE.COMPLETED") {
      const id = event.event_type === "PAYMENT.SALE.COMPLETED"
        ? event.resource?.billing_agreement_id
        : event.resource?.id;
      if (id && await syncSubscriptionWebhook(id, event.resource?.custom_id))
        status = "PROCESSED";
    }

    await prisma.webhookEvent.upsert({
      where: { eventId: event.id },
      update: { status, errorMessage: null, processedAt: new Date() },
      create: {
        eventId: event.id,
        eventType: event.event_type,
        payload: event as unknown as Prisma.InputJsonValue,
        status,
      },
    });
    logger.info("paypal.webhook_recorded", {
      provider: "paypal",
      outcome: status.toLowerCase(),
    });

    return apiSuccess({
      eventId: event.id,
      ...(purchaseId ? { purchaseId } : {}),
      ...(status === "PROCESSED" ? { processed: true } : { ignored: true }),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
