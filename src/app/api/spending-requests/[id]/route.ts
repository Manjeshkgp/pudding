import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { requireChildOrFamilyParent } from "@/lib/auth-guard";
import { RECIPIENT_EMAIL_WARNING_MESSAGE } from "@/services/spending-rules.service";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const childCounterResponseSchema = z.object({
  action: z.enum(["ACCEPT_COUNTER_OFFER", "CANCEL_REQUEST"]),
});

/**
 * GET /api/spending-requests/[id]
 * Retrieves a single spending request with its mandatory warning banner if Option A.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const spendingRequest = await prisma.spendingRequest.findUnique({
      where: { id },
      include: {
        child: { select: { id: true, name: true, avatar: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });

    if (!spendingRequest) {
      throw new ApiError(404, "Spending request not found", "REQUEST_NOT_FOUND");
    }

    await requireChildOrFamilyParent(req, spendingRequest.childId);

    return apiSuccess({
      ...spendingRequest,
      amount: spendingRequest.amount.toString(),
      counterOfferAmount:
        spendingRequest.counterOfferAmount?.toString() ?? null,
      recipientEmailWarning:
        spendingRequest.optionType === "OPTION_A_PAYPAL_EMAIL"
          ? RECIPIENT_EMAIL_WARNING_MESSAGE
          : null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PATCH /api/spending-requests/[id]
 * Allows the Child (or Parent) to:
 * 1. Accept a parent's counter-offer (`ACCEPT_COUNTER_OFFER`), which updates `amount = counterOfferAmount`
 *    and moves status back to `PENDING_APPROVAL` for final parent payout/approval.
 * 2. Cancel a pending/counter-offered request (`CANCEL_REQUEST`).
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const spendingRequest = await prisma.spendingRequest.findUnique({
      where: { id },
      include: { child: true },
    });

    if (!spendingRequest) {
      throw new ApiError(404, "Spending request not found", "REQUEST_NOT_FOUND");
    }

    const { session, child, isParent } = await requireChildOrFamilyParent(
      req,
      spendingRequest.childId
    );
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, childCounterResponseSchema);

    if (input.action === "CANCEL_REQUEST") {
      if (
        spendingRequest.status !== "PENDING_APPROVAL" &&
        spendingRequest.status !== "COUNTER_OFFERED"
      ) {
        throw new ApiError(
          409,
          `Cannot cancel request in status ${spendingRequest.status}`,
          "INVALID_STATUS"
        );
      }

      const cancelled = await prisma.spendingRequest.update({
        where: { id: spendingRequest.id },
        data: { status: "CANCELLED" },
      });

      await writeAuditLog({
        familyId: child.familyId,
        actorUserId: isParent ? session.sub : null,
        actorChildId: !isParent ? session.sub : null,
        actorRole: session.role,
        action: "SPENDING_REQUEST_CANCELLED",
        targetType: "SpendingRequest",
        targetId: cancelled.id,
        ipAddress,
        userAgent,
      });

      return apiSuccess(
        {
          ...cancelled,
          amount: cancelled.amount.toString(),
        },
        200,
        "Spending request cancelled"
      );
    }

    // ACCEPT_COUNTER_OFFER
    if (
      spendingRequest.status !== "COUNTER_OFFERED" ||
      !spendingRequest.counterOfferAmount
    ) {
      throw new ApiError(
        409,
        "This spending request does not have an active counter-offer",
        "NO_ACTIVE_COUNTER_OFFER"
      );
    }

    const accepted = await prisma.spendingRequest.update({
      where: { id: spendingRequest.id },
      data: {
        amount: spendingRequest.counterOfferAmount,
        status: "PENDING_APPROVAL",
      },
    });

    await prisma.notification.create({
      data: {
        familyId: child.familyId,
        type: "COUNTER_OFFER_ACCEPTED",
        title: `${child.name} Accepted Your Counter-Offer!`,
        message: `${child.name} accepted the $${accepted.amount.toFixed(2)} counter-offer for "${accepted.purpose}". Ready for final approval.`,
        metadata: { spendingRequestId: accepted.id },
        channel: "IN_APP",
      },
    });

    await writeAuditLog({
      familyId: child.familyId,
      actorUserId: isParent ? session.sub : null,
      actorChildId: !isParent ? session.sub : null,
      actorRole: session.role,
      action: "COUNTER_OFFER_ACCEPTED",
      targetType: "SpendingRequest",
      targetId: accepted.id,
      details: {
        acceptedAmount: accepted.amount.toString(),
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      {
        ...accepted,
        amount: accepted.amount.toString(),
        counterOfferAmount: accepted.counterOfferAmount?.toString() ?? null,
      },
      200,
      `Counter-offer of $${accepted.amount.toFixed(2)} accepted!`
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
