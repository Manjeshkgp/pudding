import { olderThan, pageCursor, pageSize, takePage } from "@/lib/list-page";
import { NextRequest } from "next/server";
import {
  LedgerEntryType,
  LedgerStatus,
  Prisma,
  WalletBucket,
} from "@prisma/client";
import prisma from "@/lib/prisma";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireAuth, requireParent } from "@/lib/auth-guard";

/**
 * GET /api/transactions
 * Full transaction history with filters: childId, type, bucket, status, startDate, endDate, limit, offset (FR-10.2).
 * Children can only see their own wallet transactions (FR-3.2, FR-11.4).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    const childIdParam = req.nextUrl.searchParams.get("childId");
    const typeParam = req.nextUrl.searchParams.get(
      "type",
    ) as LedgerEntryType | null;
    const bucketParam = req.nextUrl.searchParams.get(
      "bucket",
    ) as WalletBucket | null;
    const statusParam = req.nextUrl.searchParams.get(
      "status",
    ) as LedgerStatus | null;
    const startDateParam = req.nextUrl.searchParams.get("startDate");
    const endDateParam = req.nextUrl.searchParams.get("endDate");
    const limit = Math.min(
      200,
      Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 50)),
    );
    const offset = Math.max(
      0,
      Number(req.nextUrl.searchParams.get("offset") || 0),
    );

    const where: Prisma.LedgerEntryWhereInput = {};

    if (session.subjectType === "CHILD") {
      where.childId = session.sub;
      where.walletBucket = bucketParam || { in: ["SPEND", "SAVE", "GIVE"] };
    } else {
      const { family } = await requireParent(req);
      where.familyId = family.id;
      if (childIdParam) {
        where.childId = childIdParam;
      }
      if (bucketParam) {
        where.walletBucket = bucketParam;
      }
    }

    if (typeParam) {
      where.type = typeParam;
    }
    if (statusParam) {
      where.status = statusParam;
    }

    if (startDateParam || endDateParam) {
      where.createdAt = {
        ...(startDateParam ? { gte: new Date(startDateParam) } : {}),
        ...(endDateParam ? { lte: new Date(endDateParam) } : {}),
      };
    }

    if (req.nextUrl.searchParams.get("view") === "feed") {
      const entries = await prisma.ledgerEntry.findMany({
        where: {
          AND: [
            where,
            olderThan("createdAt", pageCursor(req.nextUrl.searchParams)),
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: pageSize + 1,
      });
      const page = takePage(entries, "createdAt");
      return apiSuccess({
        ...page,
        items: page.items.map((entry) => ({
          ...entry,
          amount: entry.amount.toString(),
        })),
      });
    }

    const [totalCount, entries] = await Promise.all([
      prisma.ledgerEntry.count({ where }),
      prisma.ledgerEntry.findMany({
        where,
        include: {
          child: {
            select: { id: true, name: true, avatar: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
    ]);

    return apiSuccess({
      totalCount,
      limit,
      offset,
      transactions: entries.map((e) => ({
        ...e,
        amount: e.amount.toString(),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
