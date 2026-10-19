import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { sendWeeklyDigestEmail } from "@/services/email.service";
import { dispatchPushToTarget } from "@/services/push.service";

export interface RunWeeklyDigestOptions {
  familyId?: string;
}

export async function runWeeklyDigestJob(options?: RunWeeklyDigestOptions) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const weekLabel = `${sevenDaysAgo.toISOString().slice(0, 10)} to ${now
    .toISOString()
    .slice(0, 10)}`;

  const families = await prisma.family.findMany({
    where: options?.familyId ? { id: options.familyId } : undefined,
    include: {
      parents: {
        where: { isFrozen: false },
        include: { notificationPreference: true },
      },
      children: {
        where: { isFrozen: false },
      },
    },
  });

  let familiesProcessed = 0;
  let digestsSent = 0;
  let emailsDelivered = 0;

  for (const family of families) {
    if (family.children.length === 0 || family.parents.length === 0) continue;
    familiesProcessed++;

    const childrenSummaries = await Promise.all(
      family.children.map(async (child) => {
        const [ledgerEntries, choresCompleted, lessonsCompleted] =
          await Promise.all([
            prisma.ledgerEntry.findMany({
              where: {
                childId: child.id,
                status: "COMPLETED",
                createdAt: { gte: sevenDaysAgo },
              },
            }),
            prisma.choreSubmission.count({
              where: {
                childId: child.id,
                status: "APPROVED",
                reviewedAt: { gte: sevenDaysAgo },
              },
            }),
            prisma.lessonProgress.count({
              where: {
                childId: child.id,
                completedAt: { gte: sevenDaysAgo },
              },
            }),
          ]);

        let earned = 0;
        let spent = 0;
        let saved = 0;
        let donated = 0;

        for (const entry of ledgerEntries) {
          const amt = Number(entry.amount);
          if (
            entry.type === "ALLOWANCE" ||
            entry.type === "CHORE_REWARD" ||
            entry.type === "CHORE_STREAK_BONUS" ||
            entry.type === "INSTANT_TRANSFER" ||
            entry.type === "GOAL_MATCH" ||
            entry.type === "SAVINGS_INTEREST" ||
            entry.type === "LESSON_REWARD"
          ) {
            earned += amt;
          } else if (
            entry.type === "SPEND_OPTION_A_PAYPAL" ||
            entry.type === "SPEND_OPTION_B_ORDER"
          ) {
            spent += amt;
          } else if (entry.type === "GOAL_DEPOSIT") {
            saved += amt;
          } else if (entry.type === "DONATION") {
            donated += amt;
          }
        }

        return {
          childName: child.name,
          totalEarned: earned.toFixed(2),
          totalSpent: spent.toFixed(2),
          totalSaved: saved.toFixed(2),
          totalDonated: donated.toFixed(2),
          choresCompleted,
          lessonsCompleted,
        };
      })
    );

    for (const parent of family.parents) {
      const pref = parent.notificationPreference;
      const digestEnabled = pref ? pref.weeklyDigestEnabled : true;
      if (!digestEnabled) continue;

      const summaryBody = childrenSummaries
        .map(
          (c) =>
            `${c.childName}: Earned $${c.totalEarned}, Spent $${c.totalSpent}, Saved $${c.totalSaved}, Chores ${c.choresCompleted}`
        )
        .join(" | ");

      await prisma.notification.create({
        data: {
          familyId: family.id,
          userId: parent.id,
          type: "WEEKLY_DIGEST",
          channel: "IN_APP",
          title: `Weekly Family Digest (${weekLabel})`,
          message: summaryBody,
          metadata: {
            type: "WEEKLY_DIGEST",
            familyId: family.id,
            weekLabel,
            childrenSummaries,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      if (!pref || pref.pushEnabled) {
        await dispatchPushToTarget({
          userId: parent.id,
          payload: {
            title: `Weekly Family Digest (${weekLabel})`,
            body: summaryBody,
            data: { type: "WEEKLY_DIGEST", familyId: family.id },
          },
        });
      }

      if ((!pref || pref.emailEnabled) && parent.email) {
        const emailResult = await sendWeeklyDigestEmail({
          to: parent.email,
          parentName: parent.name,
          familyName: family.name,
          weekLabel,
          childrenSummaries,
        });
        if (emailResult.delivered) {
          emailsDelivered++;
        }
      }

      digestsSent++;
    }
  }

  return {
    weekLabel,
    familiesProcessed,
    digestsSent,
    emailsDelivered,
  };
}
