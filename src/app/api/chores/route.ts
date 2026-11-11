import { olderThan, pageCursor, pageSize, takePage } from "@/lib/list-page";
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

const createChoreSchema = z.object({
  title: z.string().trim().min(2, "Chore title is required").max(120),
  description: z.string().trim().max(500).optional(),
  rewardAmount: z
    .number()
    .min(0, "Reward amount cannot be negative")
    .max(1000, "Reward amount cannot exceed $1,000"),
  dueDate: z.string().datetime().optional().nullable(),
  recurrence: z
    .enum(["ONCE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"])
    .default("ONCE"),
  assigneeIds: z
    .array(z.string().trim().min(1))
    .min(1, "Assign the chore to at least one child (FR-5.1)"),
  ageGroupTag: z.enum(["AGE_6_9", "AGE_10_13", "AGE_14_17"]).optional(),
});

/**
 * GET /api/chores
 * Lists chores and completion statistics for the family (Parent) or assigned chores for the Child (FR-5.1, FR-5.6).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const childIdParam = req.nextUrl.searchParams.get("childId");
    const includeInactive =
      req.nextUrl.searchParams.get("includeInactive") === "true";

    const view = req.nextUrl.searchParams.get("view");
    if (view === "manage" || view === "assigned") {
      if (view === "assigned" && session.subjectType !== "CHILD")
        throw new ApiError(403, "Child access required.", "CHILD_REQUIRED");
      const parent = view === "manage" ? await requireParent(req) : null;
      const rows = await prisma.chore.findMany({
        where: {
          familyId: parent?.family.id ?? session.familyId,
          isTemplate: false,
          ...(!parent
            ? { isActive: true, assigneeIds: { has: session.sub } }
            : {}),
          ...olderThan("createdAt", pageCursor(req.nextUrl.searchParams)),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: pageSize + 1,
      });
      const page = takePage(rows, "createdAt");
      const now = new Date();
      // Read only submission statuses for this page. The full evidence lives
      // in the separate submissions feed.
      const items = await Promise.all(
        page.items.map(async (chore) => {
          const period = chorePeriod(chore.recurrence, chore.createdAt, now);
          const latestSubmission = parent
            ? null
            : await prisma.choreSubmission.findFirst({
                where: {
                  choreId: chore.id,
                  childId: session.sub,
                  ...(period
                    ? { submittedAt: { gte: period.start, lt: period.end } }
                    : {}),
                },
                orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
                select: { status: true },
              });
          const approved =
            parent && !chore.isActive && chore.recurrence === "ONCE"
              ? await prisma.choreSubmission.findMany({
                  where: {
                    choreId: chore.id,
                    status: "APPROVED",
                    childId: { in: chore.assigneeIds },
                  },
                  select: { childId: true },
                  distinct: ["childId"],
                })
              : [];
          return {
            ...chore,
            rewardAmount: chore.rewardAmount.toString(),
            dueDate: period?.end ?? null,
            latestSubmission,
            completed:
              approved.length > 0 &&
              approved.length === chore.assigneeIds.length,
          };
        }),
      );
      return apiSuccess({ items, nextCursor: page.nextCursor });
    }

    if (session.subjectType === "CHILD") {
      // Child sees only chores assigned to them (FR-11.4)
      const chores = await prisma.chore.findMany({
        where: {
          familyId: session.familyId,
          isTemplate: false,
          isActive: true,
          assigneeIds: { has: session.sub },
        },
        include: {
          submissions: {
            where: { childId: session.sub },
            orderBy: { submittedAt: "desc" },
            take: 10,
          },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      });

      const allSubmissions = await prisma.choreSubmission.findMany({
        where: { childId: session.sub },
        select: { status: true },
      });

      const approvedCount = allSubmissions.filter(
        (s) => s.status === "APPROVED",
      ).length;
      const completionRate =
        allSubmissions.length > 0
          ? Math.round((approvedCount / allSubmissions.length) * 100)
          : 0;

      return apiSuccess({
        chores: chores.map((c) => ({
          ...c,
          rewardAmount: c.rewardAmount.toString(),
          latestSubmission:
            c.submissions.find((s) => {
              const period = chorePeriod(c.recurrence, c.createdAt);
              return (
                !period ||
                (s.submittedAt >= period.start && s.submittedAt < period.end)
              );
            }) ?? null,
          submissions: c.submissions.map((s) => ({
            ...s,
            rewardAmountPaid: s.rewardAmountPaid?.toString() ?? null,
          })),
        })),
        stats: {
          totalSubmissions: allSubmissions.length,
          approvedCount,
          pendingCount: allSubmissions.filter((s) => s.status === "PENDING")
            .length,
          rejectedCount: allSubmissions.filter((s) => s.status === "REJECTED")
            .length,
          completionRatePercent: completionRate,
        },
      });
    }

    // Parent view
    const { family } = await requireParent(req);

    const chores = await prisma.chore.findMany({
      where: {
        familyId: family.id,
        isTemplate: false,
        ...(includeInactive ? {} : { isActive: true }),
        ...(childIdParam ? { assigneeIds: { has: childIdParam } } : {}),
      },
      include: {
        submissions: {
          ...(childIdParam ? { where: { childId: childIdParam } } : {}),
          include: {
            child: {
              select: { id: true, name: true, avatar: true },
            },
          },
          orderBy: { submittedAt: "desc" },
          take: 25,
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });

    const allFamilySubmissions = await prisma.choreSubmission.findMany({
      where: {
        chore: { familyId: family.id },
        ...(childIdParam ? { childId: childIdParam } : {}),
      },
      select: { status: true, childId: true },
    });

    const approvedCount = allFamilySubmissions.filter(
      (s) => s.status === "APPROVED",
    ).length;
    const completionRate =
      allFamilySubmissions.length > 0
        ? Math.round((approvedCount / allFamilySubmissions.length) * 100)
        : 0;

    return apiSuccess({
      chores: chores.map((c) => ({
        ...c,
        rewardAmount: c.rewardAmount.toString(),
        submissions: c.submissions.map((s) => ({
          ...s,
          rewardAmountPaid: s.rewardAmountPaid?.toString() ?? null,
        })),
      })),
      stats: {
        totalSubmissions: allFamilySubmissions.length,
        approvedCount,
        pendingCount: allFamilySubmissions.filter((s) => s.status === "PENDING")
          .length,
        rejectedCount: allFamilySubmissions.filter(
          (s) => s.status === "REJECTED",
        ).length,
        completionRatePercent: completionRate,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/chores
 * Parent creates a chore with title, description, reward amount, due date, recurrence, and assignee(s) (FR-5.1).
 */
export async function POST(req: NextRequest) {
  try {
    const { user, family } = await requireParent(req, "canApproveChores");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, createChoreSchema);

    // Verify all assigneeIds belong to this family
    const children = await prisma.child.findMany({
      where: {
        id: { in: input.assigneeIds },
        familyId: family.id,
      },
      select: { id: true, name: true },
    });

    if (children.length !== input.assigneeIds.length) {
      throw new ApiError(
        400,
        "One or more assigned child IDs do not belong to your family",
        "INVALID_ASSIGNEES",
      );
    }

    const chore = await prisma.chore.create({
      data: {
        familyId: family.id,
        title: input.title,
        description: input.description ?? null,
        rewardAmount: input.rewardAmount,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        recurrence: input.recurrence,
        assigneeIds: input.assigneeIds,
        ageGroupTag: input.ageGroupTag ?? null,
        isTemplate: false,
        isActive: true,
        createdByUserId: user.id,
      },
    });

    // Notify assigned children (FR-12.1, FR-12.2)
    await prisma.notification.createMany({
      data: children.map((child) => ({
        familyId: family.id,
        childId: child.id,
        type: "NEW_CHORE_ASSIGNED",
        title: "New Chore Available!",
        message: `Complete "${chore.title}" to earn $${chore.rewardAmount.toFixed(2)}!`,
        channel: "IN_APP",
      })),
    });

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: "CHORE_CREATED",
      targetType: "Chore",
      targetId: chore.id,
      details: {
        title: chore.title,
        rewardAmount: chore.rewardAmount.toString(),
        assigneeIds: chore.assigneeIds,
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      {
        ...chore,
        rewardAmount: chore.rewardAmount.toString(),
      },
      201,
      "Chore created and assigned",
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
