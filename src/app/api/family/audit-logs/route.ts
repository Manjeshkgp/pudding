import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";

/**
 * GET /api/family/audit-logs
 * Activity log showing who did what (audit trail visible to parents, FR-10.6).
 */
export async function GET(req: NextRequest) {
  try {
    const { family } = await requireParent(req);

    const limit = Math.min(
      200,
      Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 50))
    );
    const actionFilter = req.nextUrl.searchParams.get("action");

    const logs = await prisma.auditLog.findMany({
      where: {
        familyId: family.id,
        ...(actionFilter ? { action: actionFilter } : {}),
      },
      include: {
        actorUser: {
          select: { id: true, name: true, email: true, role: true },
        },
        actorChild: {
          select: { id: true, name: true, avatar: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return apiSuccess({
      auditLogs: logs,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
