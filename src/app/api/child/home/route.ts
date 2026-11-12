import { chorePeriod } from "@/lib/chore-period";
import { olderThan, pageSize } from "@/lib/list-page";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth-guard";
import { computeGoalProjection } from "@/services/goals.service";
import { ensureLessonsAndBadgesSeeded } from "@/services/education.service";

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
 * Returns:
 * - Age band UI mode (`YOUNG_6_9`, `TWEEN_10_13`, `TEEN_14_17`)
 * - Wallet Spend and Save balances
 * - Up to three assigned tasks awaiting submission
 * - Active savings goals with projections
 * - Recent spending requests & upcoming allowance
 * - Gamified streak, XP, level, badges, and optional sibling leaderboard (if enabled by parent FR-11.4)
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

    await ensureLessonsAndBadgesSeeded();

    const child = await prisma.child.findUnique({
      where: { id: targetChildId },
      include: {
        family: {
          select: {
            id: true,
            name: true,
            currency: true,
            siblingLeaderboardEnabled: true,
          },
        },
        wallet: true,
        allowanceRules: {
          where: { status: "ACTIVE" },
          orderBy: { nextRunAt: "asc" },
        },
        savingsGoals: {
          where: { status: { in: ["ACTIVE", "COMPLETED"] } },
          orderBy: { createdAt: "desc" },
        },
        spendingRequests: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        earnedBadges: {
          include: { badge: true },
          orderBy: { earnedAt: "desc" },
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

    const [
      assignedChores,
      recentActivity,
      unreadNotifications,
      siblingLeaderboard,
    ] = await Promise.all([
      upcomingTasks(child.familyId, child.id),
      prisma.ledgerEntry.findMany({
        where: {
          childId: child.id,
          walletBucket: { in: ["SPEND", "SAVE", "GIVE"] },
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
      prisma.notification.findMany({
        where: {
          childId: child.id,
          isRead: false,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      // Sibling leaderboard ONLY if enabled by parent (FR-11.4)
      child.family.siblingLeaderboardEnabled
        ? prisma.child.findMany({
            where: { familyId: child.familyId },
            select: {
              id: true,
              name: true,
              avatar: true,
              streakCount: true,
              level: true,
              xp: true,
            },
            orderBy: [{ xp: "desc" }, { streakCount: "desc" }],
          })
        : Promise.resolve(null),
    ]);

    const goalsWithProjection = await Promise.all(
      child.savingsGoals.map(async (g) => ({
        id: g.id,
        name: g.name,
        targetAmount: g.targetAmount.toString(),
        currentAmount: g.currentAmount.toString(),
        imageUrl: g.imageUrl,
        deadline: g.deadline,
        isLocked: g.isLocked,
        matchPercentage: g.matchPercentage.toString(),
        interestRateApr: g.interestRateApr.toString(),
        status: g.status,
        projection: await computeGoalProjection(g),
      })),
    );

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

            lockedPendingBalance: child.wallet.lockedPendingBalance.toString(),
            defaultSplitSpend: child.wallet.defaultSplitSpend,
            defaultSplitSave: child.wallet.defaultSplitSave,

            isFrozen: child.wallet.isFrozen,
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
      savingsGoals: goalsWithProjection,
      spendingRequests: child.spendingRequests.map((r) => ({
        id: r.id,
        optionType: r.optionType,
        amount: r.amount.toString(),
        counterOfferAmount: r.counterOfferAmount?.toString() ?? null,
        category: r.category,
        purpose: r.purpose,
        productName: r.productName,
        recipientPaypalEmail: r.recipientPaypalEmail,
        status: r.status,
        parentComment: r.parentComment,
        createdAt: r.createdAt,
      })),
      earnedBadges: child.earnedBadges,
      recentActivity: recentActivity.map((e) => ({
        id: e.id,
        walletBucket: e.walletBucket,
        amount: e.amount.toString(),
        direction: e.direction,
        type: e.type,
        status: e.status,
        description: e.description,
        createdAt: e.createdAt,
      })),
      unreadNotifications,
      siblingLeaderboard,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
