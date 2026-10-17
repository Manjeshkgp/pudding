import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import { capturePayPalOrder } from "@/lib/paypal";
import { debitChildBucket } from "@/services/ledger.service";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const captureOrderSchema = z.object({
  paypalOrderId: z.string().trim().min(5).optional(),
  idempotencyKey: z.string().trim().min(4).max(128).optional(),
});

/**
 * POST /api/spending-requests/[id]/paypal/capture-order
 * Called immediately after the Parent completes the PayPal Checkout popup (`onApprove`).
 * Captures the PayPal Order and updates the Child's virtual wallet:
 * - If `COMPLETED`: Deducts child's `spendBalance` and marks `PAID_COMPLETED`.
 * - If `PENDING` (e.g., `UNCLAIMED` because recipient email is not registered on PayPal yet):
 *   Deducts child's `spendBalance` and locks the amount in `lockedPendingBalance` (`PAID_PENDING_CLAIM`)
 *   so the child cannot double-spend while waiting for the recipient to claim or cancel.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: requestId } = await context.params;
    const { user, family } = await requireParent(req, "canApproveSpending");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, captureOrderSchema);

    const spendingRequest = await prisma.spendingRequest.findUnique({
      where: { id: requestId },
      include: {
        child: {
          include: { wallet: true },
        },
      },
    });

    if (!spendingRequest || spendingRequest.familyId !== family.id) {
      throw new ApiError(
        404,
        "Spending request not found in your family",
        "REQUEST_NOT_FOUND"
      );
    }

    // Idempotent return if already captured
    if (
      spendingRequest.status === "PAID_COMPLETED" ||
      spendingRequest.status === "PAID_PENDING_CLAIM"
    ) {
      return apiSuccess(
        {
          spendingRequest: {
            ...spendingRequest,
            amount: spendingRequest.amount.toString(),
          },
          wallet: spendingRequest.child.wallet
            ? {
                spendBalance:
                  spendingRequest.child.wallet.spendBalance.toString(),
                saveBalance:
                  spendingRequest.child.wallet.saveBalance.toString(),
                giveBalance:
                  spendingRequest.child.wallet.giveBalance.toString(),
                lockedPendingBalance:
                  spendingRequest.child.wallet.lockedPendingBalance.toString(),
              }
            : null,
          idempotentReplay: true,
        },
        200,
        "PayPal order already captured"
      );
    }

    const orderIdToCapture =
      input.paypalOrderId || spendingRequest.paypalOrderId;

    if (!orderIdToCapture) {
      throw new ApiError(
        400,
        "No PayPal order ID found for this spending request. Call create-order first.",
        "MISSING_PAYPAL_ORDER_ID"
      );
    }

    const idempotencyKey =
      input.idempotencyKey ||
      req.headers.get("x-idempotency-key") ||
      `paypal-capture:${spendingRequest.id}:${orderIdToCapture}`;

    const captureResponse = await capturePayPalOrder(
      orderIdToCapture,
      idempotencyKey
    );

    const firstUnit = captureResponse.purchase_units?.[0];
    const captureObj = firstUnit?.payments?.captures?.[0];
    const captureId = captureObj?.id || `${orderIdToCapture}-CAP`;
    const captureStatus = captureObj?.status || captureResponse.status;
    const pendingReason = captureObj?.status_details?.reason;

    if (captureStatus === "DECLINED" || captureStatus === "FAILED") {
      await prisma.spendingRequest.update({
        where: { id: spendingRequest.id },
        data: {
          status: "PAYMENT_FAILED",
          paypalOrderId: orderIdToCapture,
          paypalCaptureId: captureId,
        },
      });

      await prisma.notification.create({
        data: {
          familyId: family.id,
          type: "PAYPAL_PAYMENT_FAILED",
          title: "PayPal Payment Failed",
          message: `The $${spendingRequest.amount.toFixed(2)} PayPal payment to ${spendingRequest.recipientPaypalEmail} was declined.`,
          channel: "IN_APP",
        },
      });

      throw new ApiError(
        402,
        "PayPal payment was declined by the funding source",
        "PAYPAL_CAPTURE_DECLINED"
      );
    }

    const isPendingClaim = captureStatus === "PENDING";

    // Debit the child's Spend bucket (and lock in lockedPendingBalance if PENDING/UNCLAIMED)
    const debitResult = await debitChildBucket({
      familyId: family.id,
      childId: spendingRequest.childId,
      bucket: "SPEND",
      amount: spendingRequest.amount,
      idempotencyKey: `spend-option-a-debit:${spendingRequest.id}`,
      entryType: "SPEND_OPTION_A_PAYPAL",
      status: isPendingClaim ? "PENDING_CLAIM" : "COMPLETED",
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
      },
    });

    const updatedRequest = await prisma.spendingRequest.update({
      where: { id: spendingRequest.id },
      data: {
        status: isPendingClaim ? "PAID_PENDING_CLAIM" : "PAID_COMPLETED",
        paypalOrderId: orderIdToCapture,
        paypalCaptureId: captureId,
        reviewedByUserId: user.id,
      },
    });

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
          spendBalance: debitResult.wallet.spendBalance.toString(),
          saveBalance: debitResult.wallet.saveBalance.toString(),
          giveBalance: debitResult.wallet.giveBalance.toString(),
          lockedPendingBalance:
            debitResult.wallet.lockedPendingBalance.toString(),
        },
      },
      200,
      isPendingClaim
        ? `Payment sent to ${spendingRequest.recipientPaypalEmail} (Pending recipient claim on PayPal)`
        : `Payment of $${spendingRequest.amount.toFixed(2)} to ${spendingRequest.recipientPaypalEmail} completed!`
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
