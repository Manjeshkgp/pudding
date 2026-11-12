import { chorePeriod } from "@/lib/chore-period";
import { olderThan, pageSize } from "@/lib/list-page";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth-guard";
import { purchaseUsage, startOfPurchaseWeek } from "@/lib/purchase-usage";

async function upcomingTasks(familyId: string, childId: string) {
  const now = new Date();
  const tasks = [];
  const loadPage = (cursor: { id: string; date: Date } | null) =>
    prisma.chore.findMany({
      where: {
        familyId,
        isTemplate: false,
        isActive: true,
        assigneeIds: { has: childId },
        ...olderThan("createdAt", cursor),
      },
      select: {
        id: true,
        title: true,
        description: true,
        rewardAmount: true,
        recurrence: true,
        createdAt: true,
        submissions: {
          where: { childId, status: { in: ["PENDING", "APPROVED"] } },
          orderBy: { submittedAt: "desc" },
          select: { submittedAt: true },
          take: 1,
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize,
    });
  let cursor: { id: string; date: Date } | null = null;

  while (tasks.length < 3) {
    const rows = await loadPage(cursor);
    for (const chore of rows) {
      const period = chorePeriod(chore.recurrence, chore.createdAt, now);
      const submittedAt = chore.submissions[0]?.submittedAt;
      if (submittedAt && (!period || submittedAt >= period.start)) continue;
      tasks.push({
        id: chore.id,
        title: chore.title,
        description: chore.description,
        rewardAmount: chore.rewardAmount.toString(),
        dueDate: period?.end ?? null,
        recurrence: chore.recurrence,
      });
      if (tasks.length === 3) break;
    }

    const last = rows.at(-1);
    if (rows.length < pageSize || !last) break;
    cursor = { id: last.id, date: last.createdAt };
  }
  return tasks;
}

/**
 * GET /api/child/home
 * Age-banded Child Home Dashboard endpoint (FR-3.2, FR-11.1, FR-11.3, FR-11.4):
 * Strictly scoped to the authenticated child (never exposes parent financial details or family budget).
 * Returns the child profile, wallet balances, upcoming allowance,
 * up to three assigned tasks, and savings goals.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const childIdParam = req.nextUrl.searchParams.get("childId");

    const targetChildId =
      session.subjectType === "CHILD" ? session.sub : childIdParam;

    if (!targetChildId) {
      throw new ApiError(400, "childId is required when viewing as a parent");
    }

    const child = await prisma.child.findUnique({
      where: { id: targetChildId },
      include: {
        family: {
          select: {
            id: true,
            name: true,
            currency: true,
          },
        },
        wallet: true,
        spendingRule: { select: { weeklyLimit: true } },
        allowanceRules: {
          where: { status: "ACTIVE" },
          orderBy: { nextRunAt: "asc" },
        },
        savingsGoals: {
          where: { status: { in: ["ACTIVE", "COMPLETED"] } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!child || child.familyId !== session.familyId) {
      throw new ApiError(404, "Child profile not found", "CHILD_NOT_FOUND");
    }

    // Age-banded UI configuration (FR-11.1)
    const uiAgeBand =
      child.age <= 9
        ? "YOUNG_6_9"
        : child.age <= 13
          ? "TWEEN_10_13"
          : "TEEN_14_17";

    const weeklyLimit = child.spendingRule?.weeklyLimit;
    const [assignedChores, weeklyUsed] = await Promise.all([
      upcomingTasks(child.familyId, child.id),
      weeklyLimit == null
        ? null
        : purchaseUsage(prisma, child.id, startOfPurchaseWeek(new Date())),
    ]);

    return apiSuccess({
      profile: {
        id: child.id,
        name: child.name,
        age: child.age,
        uiAgeBand,
        avatar: child.avatar,
        theme: child.theme,
        streakCount: child.streakCount,
        level: child.level,
        xp: child.xp,
        nextLevelXp: child.level * 200,
        currency: child.family.currency,
      },
      wallet: child.wallet
        ? {
            spendBalance: child.wallet.spendBalance.toString(),
            saveBalance: child.wallet.saveBalance.toString(),
            purchaseReservedBalance:
              child.wallet.purchaseReservedBalance.toString(),

            defaultSplitSpend: child.wallet.defaultSplitSpend,
            defaultSplitSave: child.wallet.defaultSplitSave,

            isFrozen: child.wallet.isFrozen,
          }
        : null,
      weeklySpending: weeklyLimit != null && weeklyUsed != null
        ? {
            limit: weeklyLimit.toFixed(2),
            remaining: weeklyUsed.gte(weeklyLimit)
              ? "0.00"
              : weeklyLimit.minus(weeklyUsed).toFixed(2),
          }
        : null,
      upcomingAllowance: child.allowanceRules[0]
        ? {
            amount: child.allowanceRules[0].amount.toString(),
            frequency: child.allowanceRules[0].frequency,
            nextRunAt: child.allowanceRules[0].nextRunAt,
          }
        : null,
      chores: assignedChores,
      savingsGoals: child.savingsGoals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        currentAmount: goal.currentAmount.toString(),
        targetAmount: goal.targetAmount.toString(),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
