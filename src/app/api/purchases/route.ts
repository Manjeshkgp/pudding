import { olderThan, pageCursor, pageSize, takePage } from "@/lib/list-page";
import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth, requireParent } from "@/lib/auth-guard";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { createBill, serializePurchase } from "@/services/purchase.service";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parentReviewStatuses } from "@/lib/purchase-review";
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const parent =
      session.subjectType === "USER" ? await requireParent(req) : null;
    const params = req.nextUrl.searchParams;
    const approvals = params.get("view") === "approvals";
    const status = req.nextUrl.searchParams.get("status");
    const startDateParam = params.get("startDate");
    const startDate = startDateParam ? new Date(startDateParam) : null;
    if (startDate && Number.isNaN(startDate.getTime()))
      throw new ApiError(400, "Invalid start date.", "INVALID_START_DATE");
    const purchases = await prisma.purchase.findMany({
      where: {
        ...(session.subjectType === "CHILD"
          ? { childId: session.sub }
          : { familyId: parent!.family.id }),
        ...(approvals
          ? {
              status: {
                in: [...parentReviewStatuses, "PROCESSING"],
              },
            }
          : { status: status || { not: "CREATED" } }),
        AND: [
          olderThan("createdAt", pageCursor(params)),
          ...(startDate ? [{ createdAt: { gte: startDate } }] : []),
        ],
      },
      include: { child: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
    });
    const page = takePage(purchases, "createdAt");
    const items = page.items.map((p) => ({
      ...serializePurchase(p),
      child: p.child,
    }));
    return apiSuccess({ items, purchases: items, nextCursor: page.nextCursor });
  } catch (e) {
    return handleRouteError(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    if (session.subjectType !== "CHILD")
      throw new ApiError(
        403,
        "Sign in as a child to scan a purchase.",
        "CHILD_REQUIRED",
      );
    const input = await validateBody(
      req,
      z.object({ idempotencyKey: z.string().min(8).max(128) }),
    );
    enforceRateLimit({
      key: `scan:${session.sub}`,
      limit: 30,
      windowMs: 60000,
    });
    return apiSuccess(
      {
        purchase: serializePurchase(
          await createBill(session.sub, input.idempotencyKey),
        ),
      },
      201,
    );
  } catch (e) {
    return handleRouteError(e);
  }
}
