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

const updateChoreSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  rewardAmount: z.number().min(0).max(1000).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  recurrence: z.enum(["ONCE", "DAILY", "WEEKLY", "MONTHLY"]).optional(),
  assigneeIds: z.array(z.string().trim().min(1)).min(1).optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/chores/[id]
 * Retrieves a single chore with its submission history.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await requireAuth(req);

    const chore = await prisma.chore.findUnique({
      where: { id },
      include: {
        submissions: {
          ...(session.subjectType === "CHILD"
            ? { where: { childId: session.sub } }
            : {}),
          include: {
            child: { select: { id: true, name: true, avatar: true } },
            reviewedBy: { select: { id: true, name: true } },
          },
          orderBy: { submittedAt: "desc" },
        },
      },
    });

    if (!chore || chore.familyId !== session.familyId) {
      throw new ApiError(404, "Chore not found", "CHORE_NOT_FOUND");
    }

    if (
      session.subjectType === "CHILD" &&
      !chore.assigneeIds.includes(session.sub)
    ) {
      throw new ApiError(
        403,
        "This chore is not assigned to you",
        "FORBIDDEN_CHORE_ACCESS"
      );
    }

    return apiSuccess({
      ...chore,
      rewardAmount: chore.rewardAmount.toString(),
      submissions: chore.submissions.map((s) => ({
        ...s,
        rewardAmountPaid: s.rewardAmountPaid?.toString() ?? null,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PATCH /api/chores/[id]
 * Parent updates a chore's details or active state.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, family } = await requireParent(req, "canApproveChores");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, updateChoreSchema);

    const existing = await prisma.chore.findUnique({
      where: { id },
    });

    if (!existing || existing.familyId !== family.id) {
      throw new ApiError(404, "Chore not found", "CHORE_NOT_FOUND");
    }

    if (input.assigneeIds) {
      const validChildren = await prisma.child.count({
        where: {
          id: { in: input.assigneeIds },
          familyId: family.id,
        },
      });
      if (validChildren !== input.assigneeIds.length) {
        throw new ApiError(
          400,
          "One or more assigneeIds do not belong to your family",
          "INVALID_ASSIGNEES"
        );
      }
    }

    const updated = await prisma.chore.update({
      where: { id: existing.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.rewardAmount !== undefined
          ? { rewardAmount: input.rewardAmount }
          : {}),
        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate ? new Date(input.dueDate) : null }
          : {}),
        ...(input.recurrence !== undefined
          ? { recurrence: input.recurrence }
          : {}),
        ...(input.assigneeIds !== undefined
          ? { assigneeIds: input.assigneeIds }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: "CHORE_UPDATED",
      targetType: "Chore",
      targetId: updated.id,
      details: input as Record<string, unknown>,
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      {
        ...updated,
        rewardAmount: updated.rewardAmount.toString(),
      },
      200,
      "Chore updated"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * DELETE /api/chores/[id]
 * Parent deletes or archives a chore.
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, family } = await requireParent(req, "canApproveChores");
    const { ipAddress, userAgent } = getRequestMeta(req);

    const existing = await prisma.chore.findUnique({
      where: { id },
    });

    if (!existing || existing.familyId !== family.id) {
      throw new ApiError(404, "Chore not found", "CHORE_NOT_FOUND");
    }

    await prisma.chore.delete({
      where: { id: existing.id },
    });

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: "CHORE_DELETED",
      targetType: "Chore",
      targetId: existing.id,
      details: { title: existing.title },
      ipAddress,
      userAgent,
    });

    return apiSuccess({ deletedChoreId: existing.id }, 200, "Chore deleted");
  } catch (error) {
    return handleRouteError(error);
  }
}
