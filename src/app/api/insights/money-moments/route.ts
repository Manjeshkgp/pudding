import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireAuth, requireParent } from "@/lib/auth-guard";

/**
 * GET /api/insights/money-moments?childId=...
 * Generates real-time "Money Moments" prompts for children after real actions (FR-9.3)
 * and tailored Parent Conversation Guides tied to the child's recent activity (FR-9.4).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const childIdParam = req.nextUrl.searchParams.get("childId");

    const isParent = session.subjectType === "USER";
    let targetChildId = session.subjectType === "CHILD" ? session.sub : childIdParam;

    if (isParent && !targetChildId) {
      const { family } = await requireParent(req);
      const firstChild = await prisma.child.findFirst({
        where: { familyId: family.id },
        orderBy: { createdAt: "asc" },
      });
      if (!firstChild) {
        return apiSuccess({
          moneyMoments: [],
          parentConversationGuides: [],
        });
      }
      targetChildId = firstChild.id;
    }

    const child = await prisma.child.findUnique({
      where: { id: targetChildId! },
      include: {
        wallet: true,
        savingsGoals: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!child || child.familyId !== session.familyId) {
      throw new ApiError(404, "Child not found", "CHILD_NOT_FOUND");
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [recentLedger, completedChoresCount] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where: {
          childId: child.id,
          status: "COMPLETED",
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.choreSubmission.count({
        where: {
          childId: child.id,
          status: "APPROVED",
          submittedAt: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    let totalEarned = new Prisma.Decimal(0);
    let totalSaved = new Prisma.Decimal(0);
    let totalSpent = new Prisma.Decimal(0);
    let totalGiven = new Prisma.Decimal(0);

    for (const entry of recentLedger) {
      if (
        entry.direction === "CREDIT" &&
        (entry.type === "ALLOWANCE" ||
          entry.type === "CHORE_REWARD" ||
          entry.type === "CHORE_STREAK_BONUS" ||
          entry.type === "INSTANT_TRANSFER" ||
          entry.type === "LESSON_REWARD")
      ) {
        totalEarned = totalEarned.plus(entry.amount);
        if (entry.walletBucket === "SAVE") {
          totalSaved = totalSaved.plus(entry.amount);
        } else if (entry.walletBucket === "GIVE") {
          totalGiven = totalGiven.plus(entry.amount);
        }
      }

      if (entry.type === "GOAL_DEPOSIT" && entry.walletBucket === "SPEND") {
        totalSaved = totalSaved.plus(entry.amount);
      }

      if (
        entry.direction === "DEBIT" &&
        (entry.type === "SPEND_OPTION_A_PAYPAL" ||
          entry.type === "SPEND_OPTION_B_ORDER")
      ) {
        totalSpent = totalSpent.plus(entry.amount);
      }

      if (entry.direction === "DEBIT" && entry.type === "DONATION") {
        totalGiven = totalGiven.plus(entry.amount);
      }
    }

    const savingsRatePercent = totalEarned.gt(0)
      ? Math.min(100, Math.round(totalSaved.div(totalEarned).mul(100).toNumber()))
      : child.wallet?.defaultSplitSave ?? 20;

    // Build Child-Facing "Money Moments" (FR-9.3)
    const moneyMoments: Array<{
      id: string;
      badge: string;
      title: string;
      prompt: string;
    }> = [
      {
        id: "moment-savings-rate",
        badge: "SAVINGS",
        title: `You saved ${savingsRatePercent}% of your earnings this month!`,
        prompt:
          savingsRatePercent >= 25
            ? "Super saver! Keeping over 25% in savings puts you on the fast track to your big goals."
            : "Every dollar saved adds up! Try moving $1 extra from Spend to Save this week.",
      },
    ];

    if (child.streakCount > 0) {
      moneyMoments.push({
        id: "moment-chore-streak",
        badge: "STREAK",
        title: `${child.streakCount}-Chore Streak Active!`,
        prompt: `You completed ${completedChoresCount} chores in the last 30 days. Reach a multiple of 5 for an automatic bonus!`,
      });
    }

    if (child.savingsGoals.length > 0) {
      const topGoal = child.savingsGoals[0];
      const pct = topGoal.targetAmount.gt(0)
        ? Math.round(
            topGoal.currentAmount.div(topGoal.targetAmount).mul(100).toNumber()
          )
        : 0;
      moneyMoments.push({
        id: "moment-goal-progress",
        badge: "GOAL",
        title: `${pct}% of the way to "${topGoal.name}"!`,
        prompt: `You have $${topGoal.currentAmount.toFixed(2)} saved toward your $${topGoal.targetAmount.toFixed(2)} target.`,
      });
    }

    // Build Parent Conversation Guides tied to Child Activity (FR-9.4)
    const parentConversationGuides = isParent
      ? [
          {
            id: "guide-savings-habit",
            topic: "Saving & Compounding",
            contextTrigger: `${child.name}'s 30-day savings rate is ${savingsRatePercent}% ($${totalSaved.toFixed(2)} saved out of $${totalEarned.toFixed(2)} earned).`,
            starterQuestion: `"I noticed you saved ${savingsRatePercent}% of your money this month! How does it feel watching your savings grow toward your goal?"`,
            teachingTip:
              "Consider enabling a 25% Parent Match or 5% APR interest on their active goal to visually demonstrate how banks and 401(k) matches work.",
          },
          {
            id: "guide-spending-reflection",
            topic: "Needs vs. Wants Reflection",
            contextTrigger: `${child.name} spent $${totalSpent.toFixed(2)} in the last 30 days.`,
            starterQuestion: `"Out of the things you bought recently, which one are you still happiest with today, and was there anything that felt like an impulse buy?"`,
            teachingTip:
              "Encourage the 24-hour rule on Option B product requests over $15 before approving.",
          },
          {
            id: "guide-giving-impact",
            topic: "Generosity & Giving",
            contextTrigger: `${child.name} currently has $${child.wallet?.giveBalance.toFixed(2) ?? "0.00"} in their Give bucket.`,
            starterQuestion: `"Your Give bucket has $${child.wallet?.giveBalance.toFixed(2) ?? "0.00"} ready to help others. Which cause or charity do you care about most this year?"`,
            teachingTip:
              "Review the vetted charities together in the Giving tab and let your child pick where their donation goes.",
          },
        ]
      : [];

    return apiSuccess({
      childId: child.id,
      childName: child.name,
      summary30Days: {
        totalEarned: totalEarned.toString(),
        totalSaved: totalSaved.toString(),
        totalSpent: totalSpent.toString(),
        totalGiven: totalGiven.toString(),
        savingsRatePercent,
        completedChoresCount,
      },
      moneyMoments,
      parentConversationGuides,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
