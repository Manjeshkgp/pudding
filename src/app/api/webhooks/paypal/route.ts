import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { verifyPayPalWebhookSignature } from "@/lib/paypal";
import { debitChildBucket } from "@/services/ledger.service";
import { writeAuditLog } from "@/lib/audit";

interface PayPalWebhookResource {
  id?: string;
  custom_id?: string;
  status?: string;
  status_details?: { reason?: string };
  amount?: { currency_code?: string; value?: string };
  supplementary_data?: {
    related_ids?: {
      order_id?: string;
      capture_id?: string;
    };
  };
}

interface PayPalWebhookPayload {
  id: string;
  event_type: string;
  resource?: PayPalWebhookResource;
  summary?: string;
}

/**
 * POST /api/webhooks/paypal
 * Receives, cryptographically verifies (INT-3), and deduplicates PayPal webhook events:
 * - `PAYMENT.CAPTURE.COMPLETED`
 * - `PAYMENT.CAPTURE.PENDING`
 * - `PAYMENT.CAPTURE.DENIED`
 * - `PAYMENT.CAPTURE.REVERSED` / `PAYMENT.CAPTURE.REFUNDED`
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = (await req.json()) as PayPalWebhookPayload;

    if (!rawBody || !rawBody.id || !rawBody.event_type) {
      throw new ApiError(400, "Invalid PayPal webhook payload", "INVALID_WEBHOOK");
    }

    // 1. Deduplicate event (at-least-once delivery INT-3)
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { eventId: rawBody.id },
    });
    if (existingEvent) {
      return apiSuccess(
        { eventId: rawBody.id, deduplicated: true },
        200,
        "Webhook event already processed"
      );
    }

    // 2. Cryptographically verify PayPal webhook signature (INT-3)
    const isSignatureValid = await verifyPayPalWebhookSignature(
      {
        authAlgo: req.headers.get("paypal-auth-algo"),
        certUrl: req.headers.get("paypal-cert-url"),
        transmissionId: req.headers.get("paypal-transmission-id"),
        transmissionSig: req.headers.get("paypal-transmission-sig"),
        transmissionTime: req.headers.get("paypal-transmission-time"),
      },
      rawBody as unknown as Record<string, unknown>
    );

    if (!isSignatureValid) {
      await prisma.webhookEvent.create({
        data: {
          eventId: rawBody.id,
          eventType: rawBody.event_type,
          payload: rawBody as unknown as Prisma.InputJsonValue,
          status: "FAILED",
          errorMessage: "PayPal webhook signature verification failed",
        },
      });
      throw new ApiError(
        401,
        "PayPal webhook signature verification failed",
        "INVALID_WEBHOOK_SIGNATURE"
      );
    }

    const resource = rawBody.resource || {};
    const captureId = resource.id;
    const relatedOrderId =
      resource.supplementary_data?.related_ids?.order_id;
    const customId = resource.custom_id;

    // Locate the matching SpendingRequest (or Charity Donation)
    const spendingRequest = await prisma.spendingRequest.findFirst({
      where: {
        OR: [
          ...(customId ? [{ id: customId }] : []),
          ...(captureId ? [{ paypalCaptureId: captureId }] : []),
          ...(relatedOrderId ? [{ paypalOrderId: relatedOrderId }] : []),
        ],
      },
      include: {
        child: {
          include: { wallet: true },
        },
      },
    });

    if (!spendingRequest) {
      // Check if it matches a Charity Donation
      const donation = await prisma.donation.findFirst({
        where: {
          OR: [
            ...(customId ? [{ id: customId }] : []),
            ...(captureId ? [{ paypalCaptureId: captureId }] : []),
            ...(relatedOrderId ? [{ paypalOrderId: relatedOrderId }] : []),
          ],
        },
      });

      if (donation && rawBody.event_type === "PAYMENT.CAPTURE.COMPLETED") {
        await prisma.donation.update({
          where: { id: donation.id },
          data: {
            status: "APPROVED_COMPLETED",
            paypalCaptureId: captureId ?? donation.paypalCaptureId,
            approvedAt: new Date(),
          },
        });
      }

      await prisma.webhookEvent.create({
        data: {
          eventId: rawBody.id,
          eventType: rawBody.event_type,
          payload: rawBody as unknown as Prisma.InputJsonValue,
          status: donation ? "PROCESSED" : "IGNORED",
        },
      });

      return apiSuccess({ eventId: rawBody.id, processed: true });
    }

    const eventType = rawBody.event_type;

    // Handle `PAYMENT.CAPTURE.COMPLETED`
    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      if (spendingRequest.status === "PAID_PENDING_CLAIM") {
        // Recipient claimed the payment! Clear lockedPendingBalance and mark COMPLETED.
        await prisma.$transaction(async (tx) => {
          if (spendingRequest.child.wallet) {
            const currentLocked =
              spendingRequest.child.wallet.lockedPendingBalance;
            const decrementAmt = Prisma.Decimal.min(
              currentLocked,
              spendingRequest.amount
            );
            await tx.wallet.update({
              where: { id: spendingRequest.child.wallet.id },
              data: {
                lockedPendingBalance: { decrement: decrementAmt },
              },
            });
          }

          await tx.spendingRequest.update({
            where: { id: spendingRequest.id },
            data: {
              status: "PAID_COMPLETED",
              paypalCaptureId: captureId ?? spendingRequest.paypalCaptureId,
            },
          });

          await tx.ledgerEntry.updateMany({
            where: {
              referenceId: spendingRequest.id,
              type: "SPEND_OPTION_A_PAYPAL",
              status: "PENDING_CLAIM",
            },
            data: {
              status: "COMPLETED",
              paypalCaptureId: captureId ?? spendingRequest.paypalCaptureId,
            },
          });
        });
      } else if (spendingRequest.status !== "PAID_COMPLETED") {
        // Webhook arrived before synchronous capture endpoint finished
        await debitChildBucket({
          familyId: spendingRequest.familyId,
          childId: spendingRequest.childId,
          bucket: "SPEND",
          amount: spendingRequest.amount,
          idempotencyKey: `spend-option-a-debit:${spendingRequest.id}`,
          entryType: "SPEND_OPTION_A_PAYPAL",
          status: "COMPLETED",
          referenceId: spendingRequest.id,
          paypalOrderId: relatedOrderId ?? spendingRequest.paypalOrderId ?? undefined,
          paypalCaptureId: captureId ?? undefined,
          description: `PayPal payment to ${spendingRequest.recipientPaypalEmail}: "${spendingRequest.purpose}"`,
        });

        await prisma.spendingRequest.update({
          where: { id: spendingRequest.id },
          data: {
            status: "PAID_COMPLETED",
            paypalCaptureId: captureId ?? spendingRequest.paypalCaptureId,
          },
        });
      }
    }

    // Handle `PAYMENT.CAPTURE.PENDING`
    else if (eventType === "PAYMENT.CAPTURE.PENDING") {
      if (
        spendingRequest.status !== "PAID_PENDING_CLAIM" &&
        spendingRequest.status !== "PAID_COMPLETED"
      ) {
        await debitChildBucket({
          familyId: spendingRequest.familyId,
          childId: spendingRequest.childId,
          bucket: "SPEND",
          amount: spendingRequest.amount,
          idempotencyKey: `spend-option-a-debit:${spendingRequest.id}`,
          entryType: "SPEND_OPTION_A_PAYPAL",
          status: "PENDING_CLAIM",
          lockAsPendingClaim: true,
          referenceId: spendingRequest.id,
          paypalOrderId: relatedOrderId ?? spendingRequest.paypalOrderId ?? undefined,
          paypalCaptureId: captureId ?? undefined,
          description: `PayPal payment to ${spendingRequest.recipientPaypalEmail} (Pending Recipient Claim)`,
        });

        await prisma.spendingRequest.update({
          where: { id: spendingRequest.id },
          data: {
            status: "PAID_PENDING_CLAIM",
            paypalCaptureId: captureId ?? spendingRequest.paypalCaptureId,
          },
        });
      }
    }

    // Handle `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REVERSED`, or `PAYMENT.CAPTURE.REFUNDED` (Flow 6 & FR-2.6)
    else if (
      eventType === "PAYMENT.CAPTURE.DENIED" ||
      eventType === "PAYMENT.CAPTURE.REVERSED" ||
      eventType === "PAYMENT.CAPTURE.REFUNDED"
    ) {
      const reversalIdempotencyKey = `webhook-reversal:${spendingRequest.id}`;
      const existingReversal = await prisma.ledgerEntry.findUnique({
        where: { idempotencyKey: reversalIdempotencyKey },
      });

      if (!existingReversal) {
        const hadDebitedChild =
          spendingRequest.status === "PAID_COMPLETED" ||
          spendingRequest.status === "PAID_PENDING_CLAIM";

        await prisma.$transaction(async (tx) => {
          if (hadDebitedChild && spendingRequest.child.wallet) {
            const wasPendingClaim =
              spendingRequest.status === "PAID_PENDING_CLAIM";
            const currentLocked =
              spendingRequest.child.wallet.lockedPendingBalance;
            const lockedToClear = wasPendingClaim
              ? Prisma.Decimal.min(currentLocked, spendingRequest.amount)
              : new Prisma.Decimal(0);

            // Restore the child's virtual Spend balance!
            await tx.wallet.update({
              where: { id: spendingRequest.child.wallet.id },
              data: {
                spendBalance: { increment: spendingRequest.amount },
                ...(lockedToClear.gt(0)
                  ? { lockedPendingBalance: { decrement: lockedToClear } }
                  : {}),
              },
            });

            await tx.ledgerEntry.create({
              data: {
                familyId: spendingRequest.familyId,
                childId: spendingRequest.childId,
                walletBucket: "SPEND",
                amount: spendingRequest.amount,
                direction: "CREDIT",
                type: "REVERSAL",
                status: "COMPLETED",
                idempotencyKey: reversalIdempotencyKey,
                referenceId: spendingRequest.id,
                paypalOrderId: spendingRequest.paypalOrderId,
                paypalCaptureId: captureId ?? spendingRequest.paypalCaptureId,
                description: `Restored $${spendingRequest.amount.toFixed(2)} to Spend bucket (${eventType} for ${spendingRequest.recipientPaypalEmail})`,
              },
            });

            await tx.ledgerEntry.updateMany({
              where: {
                referenceId: spendingRequest.id,
                type: "SPEND_OPTION_A_PAYPAL",
              },
              data: { status: "REVERSED" },
            });
          }

          await tx.spendingRequest.update({
            where: { id: spendingRequest.id },
            data: {
              status:
                eventType === "PAYMENT.CAPTURE.DENIED"
                  ? "PAYMENT_FAILED"
                  : "REVERSED",
            },
          });

          await tx.notification.createMany({
            data: [
              {
                familyId: spendingRequest.familyId,
                type: "PAYPAL_PAYMENT_REVERSED",
                title: "PayPal Payment Reversed / Restored",
                message: `The $${spendingRequest.amount.toFixed(2)} payment to ${spendingRequest.recipientPaypalEmail} was ${eventType.split(".").pop()?.toLowerCase()}. ${spendingRequest.child.name}'s virtual wallet balance has been automatically restored.`,
                metadata: {
                  spendingRequestId: spendingRequest.id,
                  eventType,
                },
                channel: "IN_APP",
              },
              {
                familyId: spendingRequest.familyId,
                childId: spendingRequest.childId,
                type: "CHILD_SPEND_RESTORED",
                title: "Money Returned to Your Wallet",
                message: `$${spendingRequest.amount.toFixed(2)} for "${spendingRequest.purpose}" was returned to your Spend bucket because the PayPal transfer was not completed.`,
                channel: "IN_APP",
              },
            ],
          });

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
                amountRestored: spendingRequest.amount.toString(),
              },
            },
            tx
          );
        });
      }
    }

    await prisma.webhookEvent.create({
      data: {
        eventId: rawBody.id,
        eventType: rawBody.event_type,
        payload: rawBody as unknown as Prisma.InputJsonValue,
        status: "PROCESSED",
      },
    });

    return apiSuccess(
      { eventId: rawBody.id, eventType: rawBody.event_type, processed: true },
      200,
      "Webhook processed successfully"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
