import { assessChoreEvidence } from "@/services/chore-ai.service";
import { notifyWithPush } from "@/services/notification.service";
import { chorePeriod } from "@/lib/chore-period";
import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { requireAuth, requireParent } from "@/lib/auth-guard";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const submitChoreSchema = z.object({
  childId: z.string().trim().optional(),
  proofPhotoUrl: z
    .string()
    .url("Invalid proof photo URL")
    .optional()
    .nullable(),
  childNote: z.string().trim().max(300).optional(),
  beforeEvidenceId: z.never().optional(),
  afterEvidenceId: z.string().min(1).optional(),
  periodStart: z.string().datetime().optional().nullable(),
});

/**
 * POST /api/chores/[id]/submit
 * Child marks a chore as done and can attach a photo as proof (FR-5.3).
 * Also notifies the parent for approval.
 */
export const maxDuration = 60;
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: choreId } = await context.params;
    const session = await requireAuth(req);
    if (session.subjectType === "USER")
      await requireParent(req, "canApproveChores");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, submitChoreSchema);
    if (session.subjectType === "CHILD" && (!input.afterEvidenceId || input.proofPhotoUrl))
      throw new ApiError(400, "Take one photo of the finished task.", "CHORE_PHOTO_REQUIRED");

    const targetChildId =
      session.subjectType === "CHILD" ? session.sub : input.childId;

    if (!targetChildId) {
      throw new ApiError(
        400,
        "childId is required when submitting as a parent",
      );
    }

    const [chore, child] = await Promise.all([
      prisma.chore.findUnique({ where: { id: choreId } }),
      prisma.child.findUnique({ where: { id: targetChildId } }),
    ]);

    if (!chore || !chore.isActive || chore.familyId !== session.familyId) {
      throw new ApiError(404, "Active chore not found", "CHORE_NOT_FOUND");
    }

    if (!child || child.familyId !== chore.familyId) {
      throw new ApiError(404, "Child not found", "CHILD_NOT_FOUND");
    }

    if (!chore.assigneeIds.includes(child.id)) {
      throw new ApiError(
        403,
        "This chore is not assigned to this child",
        "CHORE_NOT_ASSIGNED",
      );
    }

    const submission = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Chore" WHERE "id" = ${chore.id} FOR UPDATE`;
      const current = await tx.chore.findUnique({ where: { id: chore.id } });
      if (!current?.isActive || !current.assigneeIds.includes(child.id))
        throw new ApiError(409, "This task is no longer available.", "CHORE_INACTIVE");
      const submittedAt = new Date();
      const period = chorePeriod(current.recurrence, current.createdAt, submittedAt);
      if (period && input.periodStart !== period.start.toISOString())
        throw new ApiError(409, "This task period has ended or changed. Open the current task and start again.", "CHORE_PERIOD_CHANGED");
      const duplicate = await tx.choreSubmission.findFirst({
        where: {
          choreId: chore.id,
          childId: child.id,
          status: { in: ["PENDING", "APPROVED"] },
          ...(period ? { submittedAt: { gte: period.start, lt: period.end } } : {}),
        },
      });
      if (duplicate)
        throw new ApiError(
          409,
          "This task is already submitted or approved for this period.",
          "CHORE_ALREADY_SUBMITTED",
        );
      if (input.afterEvidenceId) {
        const photo = await tx.choreEvidence.findUnique({
          where: { id: input.afterEvidenceId },
          select: {
            choreId: true,
            childId: true,
            stage: true,
            createdAt: true,
            afterSubmission: { select: { id: true } },
          },
        });
        if (!photo || photo.choreId !== chore.id || photo.childId !== child.id || photo.stage !== "AFTER")
          throw new ApiError(400, "Use your own photo of this task.", "INVALID_CHORE_EVIDENCE");
        if (period && (photo.createdAt < period.start || photo.createdAt >= period.end))
          throw new ApiError(409, "Take a fresh photo during the current task period.", "CHORE_EVIDENCE_EXPIRED");
        if (photo.afterSubmission)
          throw new ApiError(409, "This photo has already been submitted. Take a fresh photo.");
      }
      return tx.choreSubmission.create({
        data: {
          choreId: chore.id,
          childId: child.id,
          proofPhotoUrl: input.proofPhotoUrl ?? null,
          childNote: input.childNote ?? null,
          afterEvidenceId: input.afterEvidenceId ?? null,
          submittedAt,
          status: "PENDING",
        },
      });
    });

    await assessChoreEvidence(submission.id);

    const reviewedSubmission = await prisma.choreSubmission.findUniqueOrThrow({
      where: { id: submission.id },
    });

    // Notify parents in the family (FR-12.1)
    await notifyWithPushRecord({
      data: {
        familyId: child.familyId,
        type: "CHORE_SUBMITTED_FOR_APPROVAL",
        title:
          reviewedSubmission.status === "APPROVED"
            ? `${child.name} earned a task reward!`
            : `${child.name} submitted a task`,
        message:
          reviewedSubmission.status === "APPROVED"
            ? `Gemini supported the visible result on "${chore.title}". The virtual reward was awarded automatically.`
            : `${child.name} submitted "${chore.title}" (${chore.rewardAmount.toFixed(2)}). Tap to review the submission and AI assessment.`,
        metadata: {
          choreId: chore.id,
          submissionId: submission.id,
          childId: child.id,
        },
        channel: "IN_APP",
      },
    });

    await writeAuditLog({
      familyId: child.familyId,
      actorUserId: session.subjectType === "USER" ? session.sub : null,
      actorChildId: session.subjectType === "CHILD" ? session.sub : null,
      actorRole: session.role,
      action: "CHORE_SUBMITTED",
      targetType: "ChoreSubmission",
      targetId: submission.id,
      details: {
        choreId: chore.id,
        choreTitle: chore.title,
        childId: child.id,
        hasProofPhoto: Boolean(input.afterEvidenceId || input.proofPhotoUrl),
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      reviewedSubmission,
      201,
      reviewedSubmission.status === "APPROVED"
        ? "Your evidence was supported and your reward was awarded."
        : "Your task is waiting for parent review.",
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

async function notifyWithPushRecord(
  input: Parameters<typeof prisma.notification.create>[0],
) {
  return notifyWithPush(
    input.data as import("@prisma/client").Prisma.NotificationUncheckedCreateInput,
  );
}
