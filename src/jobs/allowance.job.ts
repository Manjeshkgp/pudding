import { AllowanceFrequency, AllowanceRule, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  allowanceCycleKey,
  creditScheduledAllowance,
} from "@/services/scheduled-allowance.service";
import { writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { chorePeriod } from "@/lib/chore-period";
import {
  isScheduledAllowanceFrequency,
  scheduledAllowanceFrequencies,
} from "@/lib/allowance-frequencies";

/**
 * Calculates the next execution timestamp for an allowance rule based on its frequency (FR-4.1).
 */
export function computeNextAllowanceRunAt(
  frequency: AllowanceFrequency,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null,
  fromDate: Date = new Date(),
): Date {
  const next = new Date(fromDate);
  next.setUTCHours(9, 0, 0, 0); // Run at 09:00 UTC

  if (frequency === "DAILY") {
    if (next <= fromDate) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  if (frequency === "WEEKLY") {
    const targetDay = dayOfWeek ?? 1; // Default Monday
    let daysUntil = (targetDay - next.getUTCDay() + 7) % 7;
    if (daysUntil === 0 && next <= fromDate) {
      daysUntil = 7;
    }
    next.setUTCDate(next.getUTCDate() + daysUntil);
    return next;
  }

  if (frequency === "BIWEEKLY") {
    const targetDay = dayOfWeek ?? 1;
    let daysUntil = (targetDay - next.getUTCDay() + 7) % 7;
    if (daysUntil === 0 && next <= fromDate) {
      daysUntil = 14;
    } else {
      daysUntil += 7;
    }
    next.setUTCDate(next.getUTCDate() + daysUntil);
    return next;
  }

  // MONTHLY or CUSTOM_DAY
  const targetDayOfMonth = Math.min(Math.max(dayOfMonth ?? 1, 1), 28);
  next.setUTCDate(targetDayOfMonth);
  if (next <= fromDate) {
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(targetDayOfMonth);
  }
  return next;
}

type RunResult = {
  ruleId: string;
  childId: string;
  childName: string;
  status: "PAID" | "SKIPPED_CHORES" | "HELD_INSUFFICIENT_BUDGET";
  amountPaid: string;
  reason?: string;
};

function nextAfterCycle(rule: AllowanceRule, now: Date) {
  if (rule.anchorAt) {
    const period = chorePeriod(rule.frequency, rule.anchorAt, now);
    if (period) return period.end;
  }
  const days = { DAILY: 1, WEEKLY: 7, BIWEEKLY: 14, MONTHLY: 0, CUSTOM_DAY: 0 }[
    rule.frequency
  ];
  if (!days)
    return computeNextAllowanceRunAt(
      rule.frequency,
      rule.dayOfWeek,
      rule.dayOfMonth,
      now,
    );
  const interval = days * 86400000;
  const due = rule.nextRunAt.getTime();
  return new Date(
    due + (Math.floor((now.getTime() - due) / interval) + 1) * interval,
  );
}

export async function processDueAllowances(
  scope: { ruleId?: string; familyId?: string } = {},
) {
  const now = new Date();
  const dueRules = await prisma.allowanceRule.findMany({
    where: {
      id: scope.ruleId,
      status: "ACTIVE",
      frequency: { in: [...scheduledAllowanceFrequencies] },
      nextRunAt: { lte: now },
      ...(scope.familyId ? { child: { familyId: scope.familyId } } : {}),
    },
    select: { id: true, child: { select: { familyId: true } } },
  });
  const results: RunResult[] = [];
  for (const due of dueRules) {
    try {
      const result = await prisma.$transaction(
        async (tx): Promise<RunResult | undefined> => {
          await tx.$queryRaw`SELECT "id" FROM "Family" WHERE "id" = ${due.child.familyId} FOR UPDATE`;
          await tx.$queryRaw`SELECT "id" FROM "AllowanceRule" WHERE "id" = ${due.id} FOR UPDATE`;
          const rule = await tx.allowanceRule.findUnique({
            where: { id: due.id },
            include: { child: { include: { family: true } } },
          });
          if (!rule || rule.status !== "ACTIVE" || rule.nextRunAt > now ||
              !isScheduledAllowanceFrequency(rule.frequency)) return;
          const { child } = rule;
          const { family } = child;
          if (family.isFrozen || child.isFrozen) return;
          await tx.$queryRaw`SELECT "id" FROM "Wallet" WHERE "childId" = ${child.id} FOR UPDATE`;
          const wallet = await tx.wallet.findUnique({
            where: { childId: child.id },
          });
          if (!wallet || wallet.isFrozen) return;

          const base = {
            ruleId: rule.id,
            childId: child.id,
            childName: child.name,
          };
          const nextRunAt = nextAfterCycle(rule, now);
          const advance = () =>
            tx.allowanceRule.update({
              where: { id: rule.id },
              data: { lastRunAt: now, nextRunAt },
            });
          let amount = rule.amount;

          // Honor conditions saved by older versions of the app.
          if (rule.requireAllChores || rule.reduceByMissedChores) {
            const periodStart =
              rule.lastRunAt || new Date(now.getTime() - 7 * 86400000);
            const chores = await tx.chore.findMany({
              where: {
                familyId: family.id,
                isTemplate: false,
                isActive: true,
                assigneeIds: { has: child.id },
              },
              select: {
                submissions: {
                  where: {
                    childId: child.id,
                    status: "APPROVED",
                    submittedAt: { gte: periodStart },
                  },
                  select: { id: true },
                  take: 1,
                },
              },
            });
            const completed = chores.filter(
              (chore) => chore.submissions.length > 0,
            ).length;
            if (completed < chores.length) {
              amount = rule.requireAllChores
                ? new Prisma.Decimal(0)
                : amount.mul(completed).div(chores.length).toDecimalPlaces(2);
              if (amount.lte(0)) {
                await advance();
                await tx.notification.create({
                  data: {
                    familyId: family.id,
                    childId: child.id,
                    type: "ALLOWANCE_SKIPPED_CHORES",
                    title: "Allowance skipped",
                    message:
                      "Required tasks were not completed for this allowance cycle.",
                    channel: "IN_APP",
                  },
                });
                return {
                  ...base,
                  status: "SKIPPED_CHORES",
                  amountPaid: "0.00",
                };
              }
            }
          }

          const cycleKey = allowanceCycleKey(rule.id, rule.nextRunAt);
          // A previous version could have committed the transfer before advancing
          // the schedule. Recognize its ledger entry before checking the budget.
          const alreadyAllocated = await tx.ledgerEntry.findUnique({
            where: { idempotencyKey: `${cycleKey}:family-debit` },
            select: { id: true },
          });
          if (alreadyAllocated) {
            await advance();
            return;
          }
          if (family.unallocatedBudget.lt(amount)) {
            const alreadyNotified = await tx.notification.findFirst({
              where: {
                familyId: family.id,
                type: "ALLOWANCE_HELD_INSUFFICIENT_BUDGET",
                metadata: { path: ["cycleKey"], equals: cycleKey },
              },
              select: { id: true },
            });
            if (!alreadyNotified)
              await tx.notification.create({
                data: {
                  familyId: family.id,
                  type: "ALLOWANCE_HELD_INSUFFICIENT_BUDGET",
                  title: `Allowance held for ${child.name}`,
                  message:
                    "The family budget cannot cover this scheduled Spend allowance yet.",
                  metadata: {
                    cycleKey,
                    ruleId: rule.id,
                    childId: child.id,
                    requiredAmount: amount.toFixed(2),
                  },
                  channel: "IN_APP",
                },
              });
            return {
              ...base,
              status: "HELD_INSUFFICIENT_BUDGET",
              amountPaid: "0.00",
            };
          }

          await creditScheduledAllowance(tx, {
            ruleId: rule.id,
            familyId: family.id,
            childId: child.id,
            childName: child.name,
            amount,
            dueAt: rule.nextRunAt,
          });
          await advance();
          await writeAuditLog(
            {
              familyId: family.id,
              actorRole: "SYSTEM_CRON",
              action: "ALLOWANCE_PAID",
              targetType: "AllowanceRule",
              targetId: rule.id,
              details: {
                childId: child.id,
                amountPaid: amount.toFixed(2),
                nextRunAt: nextRunAt.toISOString(),
              },
            },
            tx,
          );
          return { ...base, status: "PAID", amountPaid: amount.toFixed(2) };
        },
      );
      if (result) results.push(result);
    } catch (error) {
      logger.error(
        "allowance.run_failed",
        { operation: "scheduled_allowance" },
        error,
      );
    }
  }
  return {
    processedCount: dueRules.length,
    paidCount: results.filter((result) => result.status === "PAID").length,
    skippedChoreConditionCount: results.filter(
      (result) => result.status === "SKIPPED_CHORES",
    ).length,
    heldInsufficientFundsCount: results.filter(
      (result) => result.status === "HELD_INSUFFICIENT_BUDGET",
    ).length,
    results,
  };
}
