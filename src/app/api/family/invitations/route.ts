import { olderThan, pageCursor, pageSize, takePage } from "@/lib/list-page";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireParent } from "@/lib/auth-guard";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireParent(req);
    const now = new Date();
    const rows = await prisma.coParentInvite.findMany({
      where: {
        email: user.email,
        status: "PENDING",
        createdAt: { gt: new Date(now.getTime() - 86400000) },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        AND: [olderThan("createdAt", pageCursor(req.nextUrl.searchParams))],
      },
      include: { family: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
    });
    const page = takePage(rows, "createdAt");
    return apiSuccess({ ...page, invites: page.items });
  } catch (e) {
    return handleRouteError(e);
  }
}
