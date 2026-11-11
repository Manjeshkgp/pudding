import { olderThan, pageCursor, pageSize, takePage } from "@/lib/list-page";
import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireParent } from "@/lib/auth-guard";
import { apiSuccess, handleRouteError, validateBody } from "@/lib/api-response";
import { enforceRateLimit } from "@/lib/rate-limit";
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireParent(req);
    const rows = await prisma.supportTicket.findMany({
      where: {
        userId: user.id,
        ...olderThan("createdAt", pageCursor(req.nextUrl.searchParams)),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
    });
    const page = takePage(rows, "createdAt");
    return apiSuccess({ ...page, tickets: page.items });
  } catch (e) {
    return handleRouteError(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const { user, family } = await requireParent(req);
    enforceRateLimit({
      key: `support:${user.id}`,
      limit: 10,
      windowMs: 3600000,
    });
    const input = await validateBody(
      req,
      z.object({
        subject: z.string().trim().min(3).max(150),
        message: z.string().trim().min(10).max(3000),
      }),
    );
    return apiSuccess(
      {
        ticket: await prisma.supportTicket.create({
          data: { familyId: family.id, userId: user.id, ...input },
        }),
      },
      201,
    );
  } catch (e) {
    return handleRouteError(e);
  }
}
