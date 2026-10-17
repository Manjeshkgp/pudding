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
import { requireAuth, requireParent } from "@/lib/auth-guard";
import { debitChildBucket } from "@/services/ledger.service";
import {
  evaluateChildSpendingRules,
  RECIPIENT_EMAIL_WARNING_MESSAGE,
} from "@/services/spending-rules.service";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const createSpendingRequestSchema = z.discriminatedUnion("optionType", [
  // Option A: Send Money to a Recipient's PayPal Email (Real Money Transfer via Orders v2 payee)
  z.object({
    optionType: z.literal("OPTION_A_PAYPAL_EMAIL"),
    childId: z.string().trim().optional(),
    amount: z
      .number()
      .positive("Amount must be greater than 0")
      .max(5000, "Amount exceeds maximum allowed"),
    category: z.string().trim().min(1, "Category is required").max(50),
    merchantName: z.string().trim().max(100).optional(),
    purpose: z.string().trim().min(2, "Purpose is required").max(300),
    recipientPaypalEmail: z
      .string()
      .trim()
      .email("A valid recipient PayPal email address is required")
      .toLowerCase(),
    emailWarningAcknowledged: z.boolean().optional().default(true),
    idempotencyKey: z.string().trim().min(4).max(128).optional(),
  }),
  // Option B: Order / Product Request (Parent Buys Outside App & Marks Approved)
  z.object({
    optionType: z.literal("OPTION_B_PRODUCT_ORDER"),
    childId: z.string().trim().optional(),
    amount: z
      .number()
      .positive("Amount must be greater than 0")
      .max(5000, "Amount exceeds maximum allowed"),
    category: z.string().trim().min(1, "Category is required").max(50),
    merchantName: z.string().trim().max(100).optional(),
    purpose: z.string().trim().min(2, "Purpose is required").max(300),
    productName: z.string().trim().min(2, "Product name is required").max(150),
    productUrl: z.string().url("Invalid product URL").optional().nullable(),
    productPhotoUrl: z
      .string()
      .url("Invalid product photo URL")
      .optional()
      .nullable(),
    idempotencyKey: z.string().trim().min(4).max(128).optional(),
  }),
]);

/**
 * GET /api/spending-requests
 * Lists spending requests for the family (Parent) or own requests for the Child (FR-7.1, FR-10.1, FR-11.4).
 * Includes the mandatory recipient-email warning banner metadata on Option A requests.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const childIdParam = req.nextUrl.searchParams.get("childId");
    const statusParam = req.nextUrl.searchParams.get("status");
    const optionTypeParam = req.nextUrl.searchParams.get("optionType");

    const whereClause: Prisma.SpendingRequestWhereInput = {};

    if (session.subjectType === "CHILD") {
      whereClause.childId = session.sub;
    } else {
      const { family } = await requireParent(req);
      whereClause.familyId = family.id;
      if (childIdParam) {
        whereClause.childId = childIdParam;
      }
    }

    if (statusParam) {
      whereClause.status = statusParam as Prisma.EnumSpendingRequestStatusFilter;
    }
    if (optionTypeParam) {
      whereClause.optionType =
        optionTypeParam as Prisma.EnumSpendingOptionTypeFilter;
    }

    const requests = await prisma.spendingRequest.findMany({
      where: whereClause,
      include: {
        child: {
          select: { id: true, name: true, avatar: true },
        },
        reviewedBy: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return apiSuccess({
      recipientEmailWarningBanner: RECIPIENT_EMAIL_WARNING_MESSAGE,
      spendingRequests: requests.map((r) => ({
        ...r,
        amount: r.amount.toString(),
        counterOfferAmount: r.counterOfferAmount?.toString() ?? null,
        recipientEmailWarning:
          r.optionType === "OPTION_A_PAYPAL_EMAIL"
            ? RECIPIENT_EMAIL_WARNING_MESSAGE
            : null,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/spending-requests
 * Child submits a Spending Request (FR-7.1):
 * - Option A (`OPTION_A_PAYPAL_EMAIL`): Recipient PayPal email + amount + category + purpose + mandatory email warning.
 * - Option B (`OPTION_B_PRODUCT_ORDER`): Product name + price + optional photo/URL + category.
 * Evaluates spending limits and merchant safe-lists (FR-7.4, FR-7.5).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, createSpendingRequestSchema);

    const isParent = session.subjectType === "USER";
    const childId = isParent ? input.childId : session.sub;

    if (!childId) {
      throw new ApiError(400, "childId is required when creating as a parent");
    }

    const child = await prisma.child.findUnique({
      where: { id: childId },
      include: { wallet: true },
    });

    if (!child || child.familyId !== session.familyId || !child.wallet) {
      throw new ApiError(404, "Child wallet not found", "CHILD_NOT_FOUND");
    }

    const headerKey = req.headers.get("x-idempotency-key");
    const idempotencyKey =
      input.idempotencyKey ||
      headerKey ||
      `spend-req:${child.id}:${Date.now()}`;

    const existingReq = await prisma.spendingRequest.findUnique({
      where: { idempotencyKey },
    });
    if (existingReq) {
      return apiSuccess(
        {
          spendingRequest: {
            ...existingReq,
            amount: existingReq.amount.toString(),
            counterOfferAmount:
              existingReq.counterOfferAmount?.toString() ?? null,
          },
          recipientEmailWarning:
            existingReq.optionType === "OPTION_A_PAYPAL_EMAIL"
              ? RECIPIENT_EMAIL_WARNING_MESSAGE
              : null,
          idempotentReplay: true,
        },
        200,
        "Spending request already submitted"
      );
    }

    const amountDecimal = new Prisma.Decimal(input.amount).toDecimalPlaces(2);

    // Evaluate per-transaction, daily/weekly/monthly limits, freeze status, and safe-list rules (FR-7.4, FR-7.5, FR-7.6)
    const ruleEvaluation = await evaluateChildSpendingRules({
      childId: child.id,
      amount: amountDecimal,
      optionType: input.optionType,
      category: input.category.toUpperCase(),
      merchantName: input.merchantName,
    });

    // If Option B qualifies for auto-approval under parent safe-list rules, deduct immediately!
    if (
      input.optionType === "OPTION_B_PRODUCT_ORDER" &&
      ruleEvaluation.canAutoApprove
    ) {
      const createdAutoApproved = await prisma.spendingRequest.create({
        data: {
          familyId: child.familyId,
          childId: child.id,
          optionType: "OPTION_B_PRODUCT_ORDER",
          amount: amountDecimal,
          category: input.category.toUpperCase(),
          merchantName: input.merchantName ?? null,
          purpose: input.purpose,
          productName: input.productName,
          productUrl: input.productUrl ?? null,
          productPhotoUrl: input.productPhotoUrl ?? null,
          status: "PAID_COMPLETED",
          parentComment: ruleEvaluation.autoApproveReason ?? "Auto-approved",
          idempotencyKey,
        },
      });

      await debitChildBucket({
        familyId: child.familyId,
        childId: child.id,
        bucket: "SPEND",
        amount: amountDecimal,
        idempotencyKey: `${idempotencyKey}:auto-debit`,
        entryType: "SPEND_OPTION_B_ORDER",
        status: "COMPLETED",
        referenceId: createdAutoApproved.id,
        actorChildId: child.id,
        description: `Auto-approved order: "${input.productName}"`,
      });

      await prisma.notification.create({
        data: {
          familyId: child.familyId,
          type: "SPEND_REQUEST_AUTO_APPROVED",
          title: `Auto-Approved Spend for ${child.name}`,
          message: `${child.name}'s $${amountDecimal.toFixed(2)} order for "${input.productName}" was auto-approved under your safe-list rules.`,
          metadata: { spendingRequestId: createdAutoApproved.id },
          channel: "IN_APP",
        },
      });

      return apiSuccess(
        {
          spendingRequest: {
            ...createdAutoApproved,
            amount: createdAutoApproved.amount.toString(),
          },
          autoApproved: true,
        },
        201,
        "Spending request automatically approved under parent safe-list rules!"
      );
    }

    // Standard PENDING_APPROVAL flow
    const createdRequest = await prisma.spendingRequest.create({
      data: {
        familyId: child.familyId,
        childId: child.id,
        optionType: input.optionType,
        amount: amountDecimal,
        category: input.category.toUpperCase(),
        merchantName: input.merchantName ?? null,
        purpose: input.purpose,
        recipientPaypalEmail:
          input.optionType === "OPTION_A_PAYPAL_EMAIL"
            ? input.recipientPaypalEmail
            : null,
        productName:
          input.optionType === "OPTION_B_PRODUCT_ORDER"
            ? input.productName
            : null,
        productUrl:
          input.optionType === "OPTION_B_PRODUCT_ORDER"
            ? (input.productUrl ?? null)
            : null,
        productPhotoUrl:
          input.optionType === "OPTION_B_PRODUCT_ORDER"
            ? (input.productPhotoUrl ?? null)
            : null,
        status: "PENDING_APPROVAL",
        idempotencyKey,
      },
    });

    // Notify Parent (FR-7.2, FR-12.1)
    await prisma.notification.create({
      data: {
        familyId: child.familyId,
        type: "SPEND_REQUEST_PENDING",
        title: `New Spend Request from ${child.name}`,
        message:
          input.optionType === "OPTION_A_PAYPAL_EMAIL"
            ? `${child.name} requested to send $${amountDecimal.toFixed(2)} via PayPal to ${input.recipientPaypalEmail} (${input.purpose}).`
            : `${child.name} requested to order "${input.productName}" for $${amountDecimal.toFixed(2)}.`,
        metadata: {
          spendingRequestId: createdRequest.id,
          optionType: createdRequest.optionType,
          recipientEmailWarning:
            input.optionType === "OPTION_A_PAYPAL_EMAIL"
              ? RECIPIENT_EMAIL_WARNING_MESSAGE
              : undefined,
        },
        channel: "IN_APP",
      },
    });

    await writeAuditLog({
      familyId: child.familyId,
      actorUserId: isParent ? session.sub : null,
      actorChildId: !isParent ? session.sub : null,
      actorRole: session.role,
      action: "SPENDING_REQUEST_CREATED",
      targetType: "SpendingRequest",
      targetId: createdRequest.id,
      details: {
        optionType: createdRequest.optionType,
        amount: createdRequest.amount.toString(),
        category: createdRequest.category,
        recipientPaypalEmail: createdRequest.recipientPaypalEmail,
        productName: createdRequest.productName,
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      {
        spendingRequest: {
          ...createdRequest,
          amount: createdRequest.amount.toString(),
          counterOfferAmount: null,
        },
        autoApproved: false,
        recipientEmailWarning:
          createdRequest.optionType === "OPTION_A_PAYPAL_EMAIL"
            ? RECIPIENT_EMAIL_WARNING_MESSAGE
            : null,
      },
      201,
      "Spending request sent to your parent for approval!"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
