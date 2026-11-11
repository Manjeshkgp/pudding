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
  beforeEvidenceId: z.string().min(1).optional(),
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
      if (Boolean(input.beforeEvidenceId) !== Boolean(input.afterEvidenceId))
        throw new ApiError(400, "Provide both before and after photos.");
      if (input.beforeEvidenceId && input.afterEvidenceId) {
        const [before, after] = await Promise.all([
          tx.choreEvidence.findUnique({
            where: { id: input.beforeEvidenceId },
          }),
          tx.choreEvidence.findUnique({ where: { id: input.afterEvidenceId } }),
        ]);
        if (
          !before ||
          !after ||
          before.choreId !== chore.id ||
          after.choreId !== chore.id ||
          before.childId !== child.id ||
          after.childId !== child.id ||
          before.stage !== "BEFORE" ||
          after.stage !== "AFTER" ||
          before.createdAt >= after.createdAt
        )
          throw new ApiError(
            400,
            "Use your own before photo followed by an after photo for this task.",
            "INVALID_CHORE_EVIDENCE",
          );
        if (period && (before.createdAt < period.start || after.createdAt >= period.end))
          throw new ApiError(409, "Capture both photos during the current task period.", "CHORE_EVIDENCE_EXPIRED");
        const used = await tx.choreSubmission.count({
          where: {
            OR: [
              { beforeEvidenceId: before.id },
              { afterEvidenceId: after.id },
            ],
          },
        });
        if (used)
          throw new ApiError(
            409,
            "These photos have already been submitted. Capture fresh evidence.",
          );
      }
      return tx.choreSubmission.create({
        data: {
          choreId: chore.id,
          childId: child.id,
          proofPhotoUrl: input.proofPhotoUrl ?? null,
          childNote: input.childNote ?? null,
          beforeEvidenceId: input.beforeEvidenceId ?? null,
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
            ? `Gemini supported the visible progress on "${chore.title}". The virtual reward was awarded automatically.`
            : `${child.name} submitted "${chore.title}" (${chore.rewardAmount.toFixed(2)}). Tap to review the photos and AI assessment.`,
        metadata: {
          choreId: chore.id,
          submissionId: submission.id,
          childId: child.id,
          href: `/chores/${chore.id}/proof`,
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
        hasProofPhoto: Boolean(input.proofPhotoUrl),
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
