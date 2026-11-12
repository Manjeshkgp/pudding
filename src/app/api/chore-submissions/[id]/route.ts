import { NextRequest } from "next/server";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import prisma from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { family } = await requireParent(req, "canApproveChores");
    const { id } = await context.params;
    const submission = await prisma.choreSubmission.findFirst({
      where: { id, chore: { familyId: family.id } },
      include: {
        child: { select: { name: true } },
        chore: {
          select: { title: true, description: true, rewardAmount: true },
        },
      },
    });
    if (!submission)
      throw new ApiError(
        404,
        "Task submission not found.",
        "SUBMISSION_NOT_FOUND",
      );

    return apiSuccess({
      ...submission,
      rewardAmountPaid: submission.rewardAmountPaid?.toString() ?? null,
      chore: {
        ...submission.chore,
        rewardAmount: submission.chore.rewardAmount.toString(),
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
