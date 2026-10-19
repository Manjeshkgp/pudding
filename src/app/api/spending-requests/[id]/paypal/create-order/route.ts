import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import { createPayPalPayeeOrder } from "@/lib/paypal";
import { RECIPIENT_EMAIL_WARNING_MESSAGE } from "@/services/spending-rules.service";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

/**
 * POST /api/spending-requests/[id]/paypal/create-order
 * Called when the Parent clicks "Approve & Pay with PayPal" on a Spend Option A request.
 * Creates a PayPal Order v2 setting `payee.email_address` to the recipient's email address
 * and `custom_id` to `spendingRequest.id` (Way 1).
 * Returns the `paypalOrderId` and `approvalUrl` for the frontend `@paypal/react-paypal-js` popup.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: requestId } = await context.params;
    const { user, family } = await requireParent(req, "canApproveSpending");
    const { ipAddress, userAgent } = getRequestMeta(req);

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

    if (spendingRequest.optionType !== "OPTION_A_PAYPAL_EMAIL") {
      throw new ApiError(
        400,
        "Only Option A (PayPal Email) requests use PayPal Checkout",
        "INVALID_OPTION_TYPE"
      );
    }

    if (!spendingRequest.recipientPaypalEmail) {
      throw new ApiError(
        400,
        "Spending request is missing recipientPaypalEmail",
        "MISSING_RECIPIENT_EMAIL"
      );
    }

    if (
      spendingRequest.status === "PAID_COMPLETED" ||
      spendingRequest.status === "PAID_PENDING_CLAIM"
    ) {
      throw new ApiError(
        409,
        `This spending request has already been paid (status: ${spendingRequest.status})`,
        "ALREADY_PAID"
      );
    }

    if (
      spendingRequest.status !== "PENDING_APPROVAL" &&
      spendingRequest.status !== "APPROVED" &&
      spendingRequest.status !== "PAYMENT_FAILED"
    ) {
      throw new ApiError(
        409,
        `Cannot initiate PayPal order for request in status: ${spendingRequest.status}`,
        "INVALID_REQUEST_STATUS"
      );
    }

    // Verify child still has sufficient SPEND bucket balance before opening PayPal popup
    const wallet = spendingRequest.child.wallet;
    if (!wallet || wallet.spendBalance.lt(spendingRequest.amount)) {
      throw new ApiError(
        400,
        `Child's Spend bucket balance ($${wallet?.spendBalance.toFixed(2) ?? "0.00"}) is insufficient for this $${spendingRequest.amount.toFixed(2)} payment`,
        "INSUFFICIENT_CHILD_BALANCE"
      );
    }

    const idempotencyKey =
      req.headers.get("x-idempotency-key") ||
      `paypal-create-order:${spendingRequest.id}:${Date.now()}`;

    const paypalOrder = await createPayPalPayeeOrder({
      amount: spendingRequest.amount.toFixed(2),
      currencyCode: family.currency,
      recipientEmail: spendingRequest.recipientPaypalEmail,
      customId: spendingRequest.id,
      description: `GoodSpend: ${spendingRequest.purpose} (for ${spendingRequest.child.name})`,
      idempotencyKey,
    });

    const updatedRequest = await prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<
        Array<{ id: string; status: string }>
      >`SELECT "id", "status" FROM "SpendingRequest" WHERE "id" = ${spendingRequest.id} FOR UPDATE`;
      const currentReq = lockedRows[0];

      if (
        !currentReq ||
        (currentReq.status !== "PENDING_APPROVAL" &&
          currentReq.status !== "APPROVED" &&
          currentReq.status !== "PAYMENT_FAILED")
      ) {
        throw new ApiError(
          409,
          `Cannot persist PayPal order for request in status: ${currentReq?.status ?? spendingRequest.status}`,
          "INVALID_REQUEST_STATUS"
        );
      }

      return tx.spendingRequest.update({
        where: { id: spendingRequest.id },
        data: {
          status: "APPROVED",
          paypalOrderId: paypalOrder.id,
          paypalCaptureId: null,
          reviewedByUserId: user.id,
        },
      });
    });

    const approveLink =
      paypalOrder.links?.find(
        (l) => l.rel === "approve" || l.rel === "payer-action"
      )?.href ?? null;

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: "PAYPAL_ORDER_CREATED_FOR_SPEND",
      targetType: "SpendingRequest",
      targetId: spendingRequest.id,
      details: {
        paypalOrderId: paypalOrder.id,
        recipientPaypalEmail: spendingRequest.recipientPaypalEmail,
        amount: spendingRequest.amount.toString(),
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      {
        paypalOrderId: paypalOrder.id,
        paypalOrderStatus: paypalOrder.status,
        approvalUrl: approveLink,
        recipientPaypalEmail: updatedRequest.recipientPaypalEmail,
        amount: updatedRequest.amount.toString(),
        currency: family.currency,
        recipientEmailWarning: RECIPIENT_EMAIL_WARNING_MESSAGE,
      },
      201,
      "PayPal order created. Confirm payment in the PayPal checkout window."
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
