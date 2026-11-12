import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import {
  choreAccess,
  imageMatchesMime,
  MAX_EVIDENCE_BYTES,
  readEvidenceForm,
} from "@/lib/chore-evidence";
import { enforceRateLimit } from "@/lib/rate-limit";
import { chorePeriod } from "@/lib/chore-period";
export const runtime = "nodejs";
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { session, chore } = await choreAccess(
      req,
      (await context.params).id,
    );
    const evidence = await prisma.choreEvidence.findMany({
      where: {
        choreId: chore.id,
        ...(session.subjectType === "CHILD" ? { childId: session.sub } : {}),
      },
      select: {
        id: true,
        childId: true,
        stage: true,
        createdAt: true,
        beforeSubmission: { select: { id: true } },
        afterSubmission: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return apiSuccess({ evidence });
  } catch (error) {
    return handleRouteError(error);
  }
}
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { session, chore } = await choreAccess(
      req,
      (await context.params).id,
    );
    if (session.subjectType !== "CHILD")
      throw new ApiError(403, "Sign in as the child to capture task evidence.");
    const child = await prisma.child.findUniqueOrThrow({
      where: { id: session.sub },
      include: { family: true },
    });
    if (!chore.isActive || child.isFrozen || child.family.isFrozen)
      throw new ApiError(403, "This task is not available right now.");
    enforceRateLimit({
      key: `chore-photo:${session.sub}`,
      limit: 12,
      windowMs: 60000,
    });
    if (
      Number(req.headers.get("content-length") || 0) >
      MAX_EVIDENCE_BYTES + 16384
    )
      throw new ApiError(413, "Photo must be smaller than 512 KB.");
    const form = await readEvidenceForm(req);
    const file = form.get("file");
    if (!(file instanceof File))
      throw new ApiError(400, "Provide one photo of the finished task.");
    if (file.size < 32 || file.size > MAX_EVIDENCE_BYTES)
      throw new ApiError(413, "Photo must be between 32 bytes and 512 KB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!imageMatchesMime(bytes, file.type))
      throw new ApiError(400, "Use a JPEG, PNG or WebP photo.");
    const createdAt = new Date();
    const period = chorePeriod(chore.recurrence, chore.createdAt, createdAt);
    if (period && form.get("periodStart") !== period.start.toISOString())
      throw new ApiError(409, "This task period has ended or changed. Take a fresh photo for the current task.", "CHORE_PERIOD_CHANGED");
    const evidence = await prisma.choreEvidence.create({
      data: {
        choreId: chore.id,
        childId: session.sub,
        stage: "AFTER",
        mimeType: file.type,
        image: bytes,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        createdAt,
      },
      select: { id: true, stage: true, createdAt: true },
    });
    return apiSuccess({ evidence }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
