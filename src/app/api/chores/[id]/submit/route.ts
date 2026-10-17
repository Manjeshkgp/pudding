import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { requireAuth } from "@/lib/auth-guard";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const submitChoreSchema = z.object({
  childId: z.string().trim().optional(),
  proofPhotoUrl: z.string().url("Invalid proof photo URL").optional().nullable(),
  childNote: z.string().trim().max(300).optional(),
});

/**
 * POST /api/chores/[id]/submit
 * Child marks a chore as done and can attach a photo as proof (FR-5.3).
 * Also notifies the parent for approval.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: choreId } = await context.params;
    const session = await requireAuth(req);
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, submitChoreSchema);

    const targetChildId =
      session.subjectType === "CHILD" ? session.sub : input.childId;

    if (!targetChildId) {
      throw new ApiError(400, "childId is required when submitting as a parent");
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
        "CHORE_NOT_ASSIGNED"
      );
    }

    // Prevent duplicate pending submissions for the same chore & child
    const existingPending = await prisma.choreSubmission.findFirst({
      where: {
        choreId: chore.id,
        childId: child.id,
        status: "PENDING",
      },
    });

    if (existingPending) {
      throw new ApiError(
        409,
        "This chore is already submitted and waiting for parent approval",
        "CHORE_ALREADY_SUBMITTED"
      );
    }

    const submission = await prisma.choreSubmission.create({
      data: {
        choreId: chore.id,
        childId: child.id,
        proofPhotoUrl: input.proofPhotoUrl ?? null,
        childNote: input.childNote ?? null,
        status: "PENDING",
      },
    });

    // Notify parents in the family (FR-12.1)
    await prisma.notification.create({
      data: {
        familyId: child.familyId,
        type: "CHORE_SUBMITTED_FOR_APPROVAL",
        title: `${child.name} finished a chore!`,
        message: `${child.name} marked "${chore.title}" ($${chore.rewardAmount.toFixed(2)}) as done. Tap to review and approve.`,
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
        hasProofPhoto: Boolean(input.proofPhotoUrl),
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      submission,
      201,
      `Great job! "${chore.title}" has been sent for parent approval.`
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
