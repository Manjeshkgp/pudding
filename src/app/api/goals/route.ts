import { olderThan, pageCursor, pageSize, takePage } from "@/lib/list-page";
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
import { computeGoalProjection } from "@/services/goals.service";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const createGoalSchema = z.object({
  childId: z.string().trim().optional(),
  name: z.string().trim().min(2, "Goal name is required").max(100),
  targetAmount: z
    .number()
    .positive("Target amount must be greater than 0")
    .max(50000),
  imageUrl: z.string().url("Invalid image URL").optional().nullable(),
  deadline: z.string().datetime().optional().nullable(),
  isLocked: z.boolean().optional().default(false),
  matchPercentage: z.number().min(0).max(500).optional().default(0),
  matchMaxAmount: z.number().positive().max(10000).optional().nullable(),
  interestRateApr: z.number().min(0).max(100).optional().default(0),
});

/**
 * GET /api/goals
 * Lists savings goals with real-time progress bar percentage and projected completion date (FR-6.1, FR-6.2).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const childIdParam = req.nextUrl.searchParams.get("childId");
    const statusParam = req.nextUrl.searchParams.get("status");

    let targetChildIds: string[] = [];

    if (session.subjectType === "CHILD") {
      // Child can only view their own goals (FR-11.4)
      targetChildIds = [session.sub];
    } else {
      const { family } = await requireParent(req);
      if (childIdParam) {
        const child = await prisma.child.findFirst({
          where: { id: childIdParam, familyId: family.id },
          select: { id: true },
        });
        if (!child) {
          throw new ApiError(
            404,
            "Child not found in your family",
            "CHILD_NOT_FOUND",
          );
        }
        targetChildIds = [child.id];
      } else {
        const familyChildren = await prisma.child.findMany({
          where: { familyId: family.id },
          select: { id: true },
        });
        targetChildIds = familyChildren.map((c) => c.id);
      }
    }

    const goals = await prisma.savingsGoal.findMany({
      where: {
        childId: { in: targetChildIds },
        ...olderThan("createdAt", pageCursor(req.nextUrl.searchParams)),
        ...(statusParam
          ? { status: statusParam as "ACTIVE" | "COMPLETED" | "WITHDRAWN" }
          : req.nextUrl.searchParams.get("view") === "feed"
            ? { status: { not: "WITHDRAWN" } }
            : {}),
      },
      include: {
        child: {
          select: { id: true, name: true, avatar: true },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
    });

    const page = takePage(goals, "createdAt");
    const enrichedGoals = await Promise.all(
      page.items.map(async (goal) => {
        const projection = await computeGoalProjection(goal);
        return {
          id: goal.id,
          childId: goal.childId,
          child: goal.child,
          name: goal.name,
          targetAmount: goal.targetAmount.toString(),
          currentAmount: goal.currentAmount.toString(),
          imageUrl: goal.imageUrl,
          deadline: goal.deadline,
          isLocked: goal.isLocked,
          unlockApprovedByParent: goal.unlockApprovedByParent,
          matchPercentage: goal.matchPercentage.toString(),
          matchMaxAmount: goal.matchMaxAmount?.toString() ?? null,
          matchedTotalSoFar: goal.matchedTotalSoFar.toString(),
          interestRateApr: goal.interestRateApr.toString(),
          lastInterestAppliedAt: goal.lastInterestAppliedAt,
          status: goal.status,
          completedAt: goal.completedAt,
          createdAt: goal.createdAt,
          projection,
        };
      }),
    );

    return apiSuccess({
      items: enrichedGoals,
      goals: enrichedGoals,
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/goals
 * Child or Parent creates a savings goal with name, target amount, image, and optional deadline (FR-6.1).
 * Parents can also set locking (FR-6.6), matching (FR-6.3), and compounding interest APR (FR-6.4) on creation.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, createGoalSchema);

    const isParent = session.subjectType === "USER";
    const childId = isParent ? input.childId : session.sub;

    if (!childId) {
      throw new ApiError(
        400,
        "childId is required when creating a goal as a parent",
      );
    }

    const child = await prisma.child.findUnique({
      where: { id: childId },
    });

    if (!child || child.familyId !== session.familyId) {
      throw new ApiError(404, "Child not found", "CHILD_NOT_FOUND");
    }

    const goal = await prisma.savingsGoal.create({
      data: {
        childId: child.id,
        name: input.name,
        targetAmount: input.targetAmount,
        currentAmount: 0,
        imageUrl: input.imageUrl ?? null,
        deadline: input.deadline ? new Date(input.deadline) : null,
        // Only parents can configure matching %, APR interest, or lock rules directly
        isLocked: isParent ? input.isLocked : false,
        matchPercentage: isParent ? input.matchPercentage : 0,
        matchMaxAmount: isParent ? (input.matchMaxAmount ?? null) : null,
        interestRateApr: isParent ? input.interestRateApr : 0,
        status: "ACTIVE",
      },
    });

    await writeAuditLog({
      familyId: child.familyId,
      actorUserId: isParent ? session.sub : null,
      actorChildId: !isParent ? session.sub : null,
      actorRole: session.role,
      action: "SAVINGS_GOAL_CREATED",
      targetType: "SavingsGoal",
      targetId: goal.id,
      details: {
        childId: child.id,
        name: goal.name,
        targetAmount: goal.targetAmount.toString(),
      },
      ipAddress,
      userAgent,
    });

    const projection = await computeGoalProjection(goal);

    return apiSuccess(
      {
        ...goal,
        targetAmount: goal.targetAmount.toString(),
        currentAmount: goal.currentAmount.toString(),
        matchPercentage: goal.matchPercentage.toString(),
        matchMaxAmount: goal.matchMaxAmount?.toString() ?? null,
        matchedTotalSoFar: goal.matchedTotalSoFar.toString(),
        interestRateApr: goal.interestRateApr.toString(),
        projection,
      },
      201,
      `Savings goal "${goal.name}" created!`,
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
