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
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const createDonationSchema = z.object({
  childId: z.string().trim().optional(),
  charityId: z.string().trim().min(1, "charityId is required"),
  amount: z
    .number()
    .positive("Donation amount must be greater than 0")
    .max(5000),
});

const reviewDonationSchema = z.object({
  donationId: z.string().trim().min(1, "donationId is required"),
  decision: z.enum(["APPROVE", "REJECT"]),
  idempotencyKey: z.string().trim().min(4).max(128).optional(),
});

/**
 * GET /api/donations
 * Lists charity donations and stored receipts for the family or child (FR-8.1, FR-8.2).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const childIdParam = req.nextUrl.searchParams.get("childId");

    const donations = await prisma.donation.findMany({
      where:
        session.subjectType === "CHILD"
          ? { childId: session.sub }
          : {
              familyId: session.familyId!,
              ...(childIdParam ? { childId: childIdParam } : {}),
            },
      include: {
        charity: true,
        child: {
          select: { id: true, name: true, avatar: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess({
      donations: donations.map((d) => ({
        ...d,
        amount: d.amount.toString(),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/donations
 * Child submits a charity donation request from their Give bucket (FR-8.1).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, createDonationSchema);

    const isParent = session.subjectType === "USER";
    const childId = isParent ? input.childId : session.sub;

    if (!childId) {
      throw new ApiError(400, "childId is required when creating as a parent");
    }

    const [child, charity] = await Promise.all([
      prisma.child.findUnique({
        where: { id: childId },
        include: { wallet: true },
      }),
      prisma.charity.findUnique({
        where: { id: input.charityId },
      }),
    ]);

    if (!child || child.familyId !== session.familyId || !child.wallet) {
      throw new ApiError(404, "Child wallet not found", "CHILD_NOT_FOUND");
    }

    if (!charity || !charity.isActive) {
      throw new ApiError(404, "Charity not found", "CHARITY_NOT_FOUND");
    }

    const amountDecimal = new Prisma.Decimal(input.amount).toDecimalPlaces(2);
    if (child.wallet.giveBalance.lt(amountDecimal)) {
      throw new ApiError(
        400,
        `Insufficient Give bucket balance ($${child.wallet.giveBalance.toFixed(2)} available, $${amountDecimal.toFixed(2)} requested)`,
        "INSUFFICIENT_GIVE_BALANCE"
      );
    }

    const donation = await prisma.donation.create({
      data: {
        familyId: child.familyId,
        childId: child.id,
        charityId: charity.id,
        amount: amountDecimal,
        status: "PENDING_APPROVAL",
      },
      include: { charity: true },
    });

    await prisma.notification.create({
      data: {
        familyId: child.familyId,
        type: "DONATION_REQUEST_PENDING",
        title: `${child.name} Wants to Donate!`,
        message: `${child.name} requested to donate $${amountDecimal.toFixed(2)} from their Give bucket to ${charity.name}.`,
        metadata: { donationId: donation.id, charityName: charity.name },
        channel: "IN_APP",
      },
    });

    await writeAuditLog({
      familyId: child.familyId,
      actorUserId: isParent ? session.sub : null,
      actorChildId: !isParent ? session.sub : null,
      actorRole: session.role,
      action: "DONATION_REQUESTED",
      targetType: "Donation",
      targetId: donation.id,
      details: {
        charityName: charity.name,
        amount: donation.amount.toString(),
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      {
        ...donation,
        amount: donation.amount.toString(),
      },
      201,
      `Donation request to ${charity.name} submitted for parent approval!`
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PATCH /api/donations
 * Parent approves or rejects a child's donation request, debits the Give bucket,
 * and stores an official donation receipt number (FR-8.2).
 */
export async function PATCH(req: NextRequest) {
  try {
    const { user, family } = await requireParent(req, "canApproveSpending");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, reviewDonationSchema);

    const donation = await prisma.donation.findUnique({
      where: { id: input.donationId },
      include: {
        charity: true,
        child: true,
      },
    });

    if (!donation || donation.familyId !== family.id) {
      throw new ApiError(404, "Donation not found", "DONATION_NOT_FOUND");
    }

    if (donation.status !== "PENDING_APPROVAL") {
      throw new ApiError(
        409,
        `Donation has already been processed (status: ${donation.status})`,
        "ALREADY_PROCESSED"
      );
    }

    if (input.decision === "REJECT") {
      const rejected = await prisma.donation.update({
        where: { id: donation.id },
        data: {
          status: "REJECTED",
          reviewedByUserId: user.id,
        },
      });

      return apiSuccess(
        { ...rejected, amount: rejected.amount.toString() },
        200,
        "Donation request declined"
      );
    }

    // APPROVE donation: debit child's GIVE bucket and generate stored receipt (FR-8.2)
    const idempotencyKey =
      input.idempotencyKey || `donation-approve:${donation.id}`;

    const debitResult = await debitChildBucket({
      familyId: family.id,
      childId: donation.childId,
      bucket: "GIVE",
      amount: donation.amount,
      idempotencyKey,
      entryType: "DONATION",
      status: "COMPLETED",
      referenceId: donation.id,
      actorUserId: user.id,
      description: `Charity donation to ${donation.charity.name}`,
      metadata: {
        charityId: donation.charityId,
        charityName: donation.charity.name,
      },
    });

    const receiptNumber = `GS-DON-${new Date().getUTCFullYear()}-${donation.id.slice(-6).toUpperCase()}`;

    const approved = await prisma.donation.update({
      where: { id: donation.id },
      data: {
        status: "APPROVED_COMPLETED",
        receiptNumber,
        reviewedByUserId: user.id,
        approvedAt: new Date(),
      },
      include: { charity: true },
    });

    await prisma.notification.create({
      data: {
        familyId: family.id,
        childId: donation.childId,
        type: "DONATION_APPROVED",
        title: "Thank You for Giving!",
        message: `Your $${donation.amount.toFixed(2)} donation to ${donation.charity.name} was approved! Receipt: ${receiptNumber}`,
        metadata: {
          donationId: approved.id,
          receiptNumber,
        },
        channel: "IN_APP",
      },
    });

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: "DONATION_APPROVED",
      targetType: "Donation",
      targetId: approved.id,
      details: {
        charityName: donation.charity.name,
        amount: approved.amount.toString(),
        receiptNumber,
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      {
        donation: {
          ...approved,
          amount: approved.amount.toString(),
        },
        wallet: {
          spendBalance: debitResult.wallet.spendBalance.toString(),
          saveBalance: debitResult.wallet.saveBalance.toString(),
          giveBalance: debitResult.wallet.giveBalance.toString(),
        },
      },
      200,
      `Donation to ${donation.charity.name} approved! Receipt ${receiptNumber} stored.`
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
