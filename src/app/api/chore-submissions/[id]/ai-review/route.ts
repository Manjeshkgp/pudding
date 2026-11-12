import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireParent } from "@/lib/auth-guard";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assessChoreEvidence } from "@/services/chore-ai.service";
export const maxDuration = 60;
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth(req);
    if (session.subjectType === "USER")
      await requireParent(req, "canApproveChores");
    const id = (await context.params).id;
    const submission = await prisma.choreSubmission.findUnique({
      where: { id },
      include: { chore: { select: { familyId: true } } },
    });
    if (
      !submission ||
      submission.chore.familyId !== session.familyId ||
      (session.subjectType === "CHILD" && submission.childId !== session.sub)
    )
      throw new ApiError(404, "Task submission not found.");
    enforceRateLimit({ key: `chore-ai:${id}`, limit: 3, windowMs: 3600000 });
    await assessChoreEvidence(id);
    return apiSuccess({
      submission: await prisma.choreSubmission.findUniqueOrThrow({
        where: { id },
      }),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
