import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import { debitChildBucket } from "@/services/ledger.service";
import { RECIPIENT_EMAIL_WARNING_MESSAGE } from "@/services/spending-rules.service";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const reviewSpendingSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("REJECT"),
    parentComment: z.string().trim().max(300).optional(),
  }),
  z.object({
    decision: z.literal("COUNTER_OFFER"),
    counterOfferAmount: z
      .number()
      .positive("Counter-offer amount must be greater than 0")
      .max(5000),
    parentComment: z.string().trim().max(300).optional(),
  }),
  z.object({
    decision: z.literal("APPROVE"),
    parentComment: z.string().trim().max(300).optional(),
    idempotencyKey: z.string().trim().min(4).max(128).optional(),
  }),
]);

/**
 * POST /api/spending-requests/[id]/review
 * Parent reviews a Child's Spending Request (FR-7.2, FR-7.3):
 * 1. REJECT: Marks request REJECTED and notifies child.
 * 2. COUNTER_OFFER: Proposes a counterOfferAmount and notifies child.
 * 3. APPROVE:
 *    - For Option B (`OPTION_B_PRODUCT_ORDER` - Parent buys outside app): Immediately deducts child's
 *      virtual Spend bucket and marks `PAID_COMPLETED`.
 *    - For Option A (`OPTION_A_PAYPAL_EMAIL` - Send real money to recipient PayPal email): Marks request
 *      `APPROVED` (ready for PayPal Checkout popup via `/api/spending-requests/[id]/paypal/create-order` in Task 7)
 *      and returns the mandatory email warning banner.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, family } = await requireParent(req, "canApproveSpending");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, reviewSpendingSchema);

    const spendingRequest = await prisma.spendingRequest.findUnique({
      where: { id },
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

    if (
      spendingRequest.status !== "PENDING_APPROVAL" &&
      spendingRequest.status !== "COUNTER_OFFERED" &&
      spendingRequest.status !== "APPROVED"
    ) {
      throw new ApiError(
        409,
        `Spending request cannot be reviewed in status: ${spendingRequest.status}`,
        "REQUEST_ALREADY_FINALIZED"
      );
    }

    // 1. REJECT
    if (input.decision === "REJECT") {
      const rejected = await prisma.$transaction(async (tx) => {
        const lockedRows = await tx.$queryRaw<
          Array<{
            id: string;
            status: string;
            paypalOrderId: string | null;
          }>
        >`SELECT "id", "status", "paypalOrderId" FROM "SpendingRequest" WHERE "id" = ${spendingRequest.id} FOR UPDATE`;
        const currentReq = lockedRows[0];

        if (
          !currentReq ||
          (currentReq.status !== "PENDING_APPROVAL" &&
            currentReq.status !== "COUNTER_OFFERED" &&
            currentReq.status !== "APPROVED")
        ) {
          throw new ApiError(
            409,
            `Spending request cannot be rejected in status: ${currentReq?.status ?? spendingRequest.status}`,
            "REQUEST_ALREADY_FINALIZED"
          );
        }

        if (currentReq.paypalOrderId) {
          throw new ApiError(
            409,
            "Cannot reject a spending request while a PayPal checkout order is already in progress",
            "PAYPAL_ORDER_IN_PROGRESS"
          );
        }

        return tx.spendingRequest.update({
          where: { id: spendingRequest.id },
          data: {
            status: "REJECTED",
            parentComment: input.parentComment ?? null,
            reviewedByUserId: user.id,
          },
        });
      });

      await prisma.notification.create({
        data: {
          familyId: family.id,
          childId: spendingRequest.childId,
          type: "SPEND_REQUEST_REJECTED",
          title: "Spend Request Update",
          message:
            input.parentComment ||
            `${user.name} declined your $${spendingRequest.amount.toFixed(2)} request for "${spendingRequest.purpose}".`,
          channel: "IN_APP",
        },
      });

      await writeAuditLog({
        familyId: family.id,
        actorUserId: user.id,
        actorRole: user.role,
        action: "SPENDING_REQUEST_REJECTED",
        targetType: "SpendingRequest",
        targetId: rejected.id,
        details: {
          childId: spendingRequest.childId,
          amount: spendingRequest.amount.toString(),
          parentComment: input.parentComment,
        },
        ipAddress,
        userAgent,
      });

      return apiSuccess(
        {
          spendingRequest: {
            ...rejected,
            amount: rejected.amount.toString(),
          },
        },
        200,
        "Spending request rejected"
      );
    }

    // 2. COUNTER_OFFER (FR-7.2)
    if (input.decision === "COUNTER_OFFER") {
      const counterDecimal = new Prisma.Decimal(
        input.counterOfferAmount
      ).toDecimalPlaces(2);

      const countered = await prisma.$transaction(async (tx) => {
        const lockedRows = await tx.$queryRaw<
          Array<{
            id: string;
            status: string;
            paypalOrderId: string | null;
          }>
        >`SELECT "id", "status", "paypalOrderId" FROM "SpendingRequest" WHERE "id" = ${spendingRequest.id} FOR UPDATE`;
        const currentReq = lockedRows[0];

        if (
          !currentReq ||
          (currentReq.status !== "PENDING_APPROVAL" &&
            currentReq.status !== "COUNTER_OFFERED" &&
            currentReq.status !== "APPROVED")
        ) {
          throw new ApiError(
            409,
            `Spending request cannot be counter-offered in status: ${currentReq?.status ?? spendingRequest.status}`,
            "REQUEST_ALREADY_FINALIZED"
          );
        }

        if (currentReq.paypalOrderId) {
          throw new ApiError(
            409,
            "Cannot counter-offer a spending request while a PayPal checkout order is already in progress",
            "PAYPAL_ORDER_IN_PROGRESS"
          );
        }

        return tx.spendingRequest.update({
          where: { id: spendingRequest.id },
          data: {
            status: "COUNTER_OFFERED",
            counterOfferAmount: counterDecimal,
            parentComment: input.parentComment ?? null,
            reviewedByUserId: user.id,
          },
        });
      });

      await prisma.notification.create({
        data: {
          familyId: family.id,
          childId: spendingRequest.childId,
          type: "SPEND_REQUEST_COUNTER_OFFER",
          title: `${user.name} Sent a Counter-Offer!`,
          message: `${user.name} offered $${counterDecimal.toFixed(2)} instead of $${spendingRequest.amount.toFixed(2)} for "${spendingRequest.purpose}".`,
          metadata: { spendingRequestId: countered.id },
          channel: "IN_APP",
        },
      });

      await writeAuditLog({
        familyId: family.id,
        actorUserId: user.id,
        actorRole: user.role,
        action: "SPENDING_REQUEST_COUNTER_OFFERED",
        targetType: "SpendingRequest",
        targetId: countered.id,
        details: {
          originalAmount: spendingRequest.amount.toString(),
          counterOfferAmount: counterDecimal.toString(),
          parentComment: input.parentComment,
        },
        ipAddress,
        userAgent,
      });

      return apiSuccess(
        {
          spendingRequest: {
            ...countered,
            amount: countered.amount.toString(),
            counterOfferAmount:
              countered.counterOfferAmount?.toString() ?? null,
          },
        },
        200,
        `Counter-offer of $${counterDecimal.toFixed(2)} sent to ${spendingRequest.child.name}`
      );
    }

    // 3. APPROVE
    if (spendingRequest.optionType === "OPTION_B_PRODUCT_ORDER") {
      // Option B: Parent purchases outside app and approves -> immediately deduct virtual Spend bucket!
      const idempotencyKey =
        input.idempotencyKey ||
        req.headers.get("x-idempotency-key") ||
        `spend-option-b-approve:${spendingRequest.id}`;

      const debitResult = await debitChildBucket({
        familyId: family.id,
        childId: spendingRequest.childId,
        bucket: "SPEND",
        amount: spendingRequest.amount,
        idempotencyKey,
        entryType: "SPEND_OPTION_B_ORDER",
        status: "COMPLETED",
        referenceId: spendingRequest.id,
        actorUserId: user.id,
        description: `Approved product order: "${spendingRequest.productName || spendingRequest.purpose}"`,
        metadata: {
          productName: spendingRequest.productName,
          productUrl: spendingRequest.productUrl,
          category: spendingRequest.category,
          merchantName: spendingRequest.merchantName,
        },
      });

      const approvedOptionB = await prisma.spendingRequest.update({
        where: { id: spendingRequest.id },
        data: {
          status: "PAID_COMPLETED",
          parentComment: input.parentComment ?? null,
          reviewedByUserId: user.id,
        },
      });

      await prisma.notification.create({
        data: {
          familyId: family.id,
          childId: spendingRequest.childId,
          type: "SPEND_REQUEST_APPROVED",
          title: "Order Approved!",
          message: `${user.name} approved your $${spendingRequest.amount.toFixed(2)} order for "${spendingRequest.productName || spendingRequest.purpose}"!`,
          channel: "IN_APP",
        },
      });

      await writeAuditLog({
        familyId: family.id,
        actorUserId: user.id,
        actorRole: user.role,
        action: "SPEND_OPTION_B_APPROVED_COMPLETED",
        targetType: "SpendingRequest",
        targetId: approvedOptionB.id,
        details: {
          childId: spendingRequest.childId,
          amount: approvedOptionB.amount.toString(),
          productName: approvedOptionB.productName,
        },
        ipAddress,
        userAgent,
      });

      return apiSuccess(
        {
          spendingRequest: {
            ...approvedOptionB,
            amount: approvedOptionB.amount.toString(),
          },
          wallet: {
            spendBalance: debitResult.wallet.spendBalance.toString(),
            saveBalance: debitResult.wallet.saveBalance.toString(),
            giveBalance: debitResult.wallet.giveBalance.toString(),
          },
          requiresPayPalCheckout: false,
        },
        200,
        `Approved "${spendingRequest.productName || spendingRequest.purpose}" and deducted $${spendingRequest.amount.toFixed(2)} from ${spendingRequest.child.name}'s wallet`
      );
    }

    // Option A (`OPTION_A_PAYPAL_EMAIL`): Mark as APPROVED and return instructions to launch PayPal Checkout popup
    const approvedOptionA = await prisma.spendingRequest.update({
      where: { id: spendingRequest.id },
      data: {
        status: "APPROVED",
        parentComment: input.parentComment ?? null,
        reviewedByUserId: user.id,
      },
    });

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: "SPEND_OPTION_A_APPROVED_AWAITING_PAYPAL",
      targetType: "SpendingRequest",
      targetId: approvedOptionA.id,
      details: {
        childId: spendingRequest.childId,
        amount: approvedOptionA.amount.toString(),
        recipientPaypalEmail: approvedOptionA.recipientPaypalEmail,
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      {
        spendingRequest: {
          ...approvedOptionA,
          amount: approvedOptionA.amount.toString(),
        },
        requiresPayPalCheckout: true,
        nextStepEndpoint: `/api/spending-requests/${approvedOptionA.id}/paypal/create-order`,
        recipientEmailWarning: RECIPIENT_EMAIL_WARNING_MESSAGE,
      },
      200,
      "Request approved. Complete the PayPal checkout popup to send funds to the recipient."
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
