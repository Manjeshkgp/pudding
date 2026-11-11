import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireAuth, requireParent } from "@/lib/auth-guard";
import { taskFrequencies } from "@/lib/chore-period";
import { olderThan, pageCursor, pageSize, takePage } from "@/lib/list-page";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const params = req.nextUrl.searchParams;
    const parent =
      session.subjectType === "USER" ? await requireParent(req) : null;
    const recurrence = z
      .enum(taskFrequencies)
      .optional()
      .parse(params.get("recurrence") ?? undefined);
    const status = z
      .enum(["PENDING", "APPROVED", "REJECTED"])
      .optional()
      .parse(params.get("status") ?? undefined);
    const rows = await prisma.choreSubmission.findMany({
      where: {
        ...(parent
          ? {
              chore: {
                familyId: parent.family.id,
                ...(recurrence ? { recurrence } : {}),
              },
            }
          : { childId: session.sub }),
        ...(params.get("choreId") ? { choreId: params.get("choreId")! } : {}),
        ...(status ? { status } : {}),
        ...olderThan("submittedAt", pageCursor(params)),
      },
      include: {
        child: { select: { name: true } },
        chore: {
          select: {
            id: true,
            title: true,
            recurrence: true,
            rewardAmount: true,
          },
        },
      },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
    });
    const page = takePage(rows, "submittedAt");
    return apiSuccess({
      nextCursor: page.nextCursor,
      items: page.items.map((row) => ({
        ...row,
        rewardAmountPaid: row.rewardAmountPaid?.toString() ?? null,
        chore: {
          ...row.chore,
          rewardAmount: row.chore.rewardAmount.toString(),
        },
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
