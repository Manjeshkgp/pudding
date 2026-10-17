import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth-guard";

/**
 * GET /api/donations/summary?year=2026&childId=...
 * Generates the annual giving summary per child with stored receipts (FR-8.2, FR-8.3).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const yearParam = Number(
      req.nextUrl.searchParams.get("year") || new Date().getUTCFullYear()
    );
    const childIdParam = req.nextUrl.searchParams.get("childId");

    const startOfYear = new Date(Date.UTC(yearParam, 0, 1, 0, 0, 0));
    const endOfYear = new Date(Date.UTC(yearParam, 11, 31, 23, 59, 59));

    const donations = await prisma.donation.findMany({
      where: {
        ...(session.subjectType === "CHILD"
          ? { childId: session.sub }
          : {
              familyId: session.familyId!,
              ...(childIdParam ? { childId: childIdParam } : {}),
            }),
        status: "APPROVED_COMPLETED",
        approvedAt: {
          gte: startOfYear,
          lte: endOfYear,
        },
      },
      include: {
        charity: true,
        child: {
          select: { id: true, name: true, avatar: true },
        },
      },
      orderBy: { approvedAt: "desc" },
    });

    const perChildSummaryMap = new Map<
      string,
      {
        childId: string;
        childName: string;
        totalDonated: Prisma.Decimal;
        donationsCount: number;
        receipts: Array<{
          donationId: string;
          receiptNumber: string | null;
          charityName: string;
          category: string;
          amount: string;
          approvedAt: Date | null;
        }>;
      }
    >();

    let familyGrandTotal = new Prisma.Decimal(0);

    for (const d of donations) {
      familyGrandTotal = familyGrandTotal.plus(d.amount);
      const existing = perChildSummaryMap.get(d.childId) || {
        childId: d.childId,
        childName: d.child.name,
        totalDonated: new Prisma.Decimal(0),
        donationsCount: 0,
        receipts: [],
      };

      existing.totalDonated = existing.totalDonated.plus(d.amount);
      existing.donationsCount += 1;
      existing.receipts.push({
        donationId: d.id,
        receiptNumber: d.receiptNumber,
        charityName: d.charity.name,
        category: d.charity.category,
        amount: d.amount.toString(),
        approvedAt: d.approvedAt,
      });

      perChildSummaryMap.set(d.childId, existing);
    }

    return apiSuccess({
      year: yearParam,
      familyTotalDonated: familyGrandTotal.toString(),
      childrenSummaries: Array.from(perChildSummaryMap.values()).map((c) => ({
        ...c,
        totalDonated: c.totalDonated.toString(),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
