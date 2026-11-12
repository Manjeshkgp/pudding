import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireParent } from "@/lib/auth-guard";
import { ApiError, handleRouteError } from "@/lib/api-response";
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth(req);
    if (session.subjectType === "USER")
      await requireParent(req, "canApproveChores");
    const evidence = await prisma.choreEvidence.findUnique({
      where: { id: (await context.params).id },
      include: { chore: { select: { familyId: true } } },
    });
    if (
      !evidence ||
      evidence.chore.familyId !== session.familyId ||
      (session.subjectType === "CHILD" && evidence.childId !== session.sub)
    )
      throw new ApiError(404, "Photo not found.");
    return new NextResponse(new Uint8Array(evidence.image), {
      headers: {
        "Content-Type": evidence.mimeType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
