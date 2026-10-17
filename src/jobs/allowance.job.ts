import { AllowanceFrequency, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { transferFromFamilyToChild } from "@/services/ledger.service";
import { writeAuditLog } from "@/lib/audit";

/**
 * Calculates the next execution timestamp for an allowance rule based on its frequency (FR-4.1).
 */
export function computeNextAllowanceRunAt(
  frequency: AllowanceFrequency,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null,
  fromDate: Date = new Date()
): Date {
  const next = new Date(fromDate);
  next.setUTCHours(9, 0, 0, 0); // Run at 09:00 UTC

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

export interface AllowanceRunSummary {
  processedCount: number;
  paidCount: number;
  skippedChoreConditionCount: number;
  heldInsufficientFundsCount: number;
  results: Array<{
    ruleId: string;
    childId: string;
    childName: string;
    status: "PAID" | "SKIPPED_CHORES" | "HELD_INSUFFICIENT_BUDGET";
    amountPaid: string;
    reason?: string;
  }>;
}

/**
 * Processes all due active allowance rules (FR-4.2, FR-4.3, FR-4.5, NFR-14).
 * Can be invoked by in-process node-cron or via POST /api/jobs/run-allowances.
 */
export async function processDueAllowances(
  specificRuleId?: string
): Promise<AllowanceRunSummary> {
  const now = new Date();

  const dueRules = await prisma.allowanceRule.findMany({
    where: {
      status: "ACTIVE",
      ...(specificRuleId
        ? { id: specificRuleId }
        : { nextRunAt: { lte: now } }),
    },
    include: {
      child: {
        include: {
          family: true,
          wallet: true,
        },
      },
    },
  });

  const summary: AllowanceRunSummary = {
    processedCount: dueRules.length,
    paidCount: 0,
    skippedChoreConditionCount: 0,
    heldInsufficientFundsCount: 0,
    results: [],
  };

  for (const rule of dueRules) {
    const { child } = rule;
    const { family } = child;

    if (family.isFrozen || child.isFrozen || child.wallet?.isFrozen) {
      continue;
    }

    let effectiveAmount = new Prisma.Decimal(rule.amount);

    // Evaluate optional chore rules (FR-4.5): requireAllChores or reduceByMissedChores
    if (rule.requireAllChores || rule.reduceByMissedChores) {
      const periodStart =
        rule.lastRunAt ||
        new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const assignedChores = await prisma.chore.findMany({
        where: {
          familyId: family.id,
          isTemplate: false,
          isActive: true,
          assigneeIds: { has: child.id },
        },
        include: {
          submissions: {
            where: {
              childId: child.id,
              status: "APPROVED",
              submittedAt: { gte: periodStart },
            },
          },
        },
      });

      if (assignedChores.length > 0) {
        const completedChores = assignedChores.filter(
          (c) => c.submissions.length > 0
        ).length;
        const missedChores = assignedChores.length - completedChores;

        if (rule.requireAllChores && missedChores > 0) {
          // Skip payment for this cycle and advance nextRunAt
          const nextRun = computeNextAllowanceRunAt(
            rule.frequency,
            rule.dayOfWeek,
            rule.dayOfMonth,
            now
          );

          await prisma.allowanceRule.update({
            where: { id: rule.id },
            data: {
              lastRunAt: now,
              nextRunAt: nextRun,
            },
          });

          await prisma.notification.create({
            data: {
              familyId: family.id,
              childId: child.id,
              type: "ALLOWANCE_SKIPPED_CHORES",
              title: "Allowance Skipped — Chores Incomplete",
              message: `${child.name} missed ${missedChores} of ${assignedChores.length} required chores for this allowance cycle.`,
              channel: "IN_APP",
            },
          });

          summary.skippedChoreConditionCount += 1;
          summary.results.push({
            ruleId: rule.id,
            childId: child.id,
            childName: child.name,
            status: "SKIPPED_CHORES",
            amountPaid: "0.00",
            reason: `Missed ${missedChores} of ${assignedChores.length} assigned chores`,
          });
          continue;
        }

        if (rule.reduceByMissedChores && missedChores > 0) {
          const completionRatio = new Prisma.Decimal(completedChores).div(
            assignedChores.length
          );
          effectiveAmount = effectiveAmount
            .mul(completionRatio)
            .toDecimalPlaces(2);

          if (effectiveAmount.lte(0)) {
            const nextRun = computeNextAllowanceRunAt(
              rule.frequency,
              rule.dayOfWeek,
              rule.dayOfMonth,
              now
            );
            await prisma.allowanceRule.update({
              where: { id: rule.id },
              data: { lastRunAt: now, nextRunAt: nextRun },
            });

            summary.skippedChoreConditionCount += 1;
            summary.results.push({
              ruleId: rule.id,
              childId: child.id,
              childName: child.name,
              status: "SKIPPED_CHORES",
              amountPaid: "0.00",
              reason: "0 chores completed (pro-rated to $0.00)",
            });
            continue;
          }
        }
      }
    }

    // Attempt atomic transfer from Family Unallocated Budget -> Child Wallet (FR-4.2)
    const cycleDateKey = rule.nextRunAt.toISOString().slice(0, 10);
    const idempotencyKey = `allowance:${rule.id}:${cycleDateKey}`;

    try {
      await transferFromFamilyToChild({
        familyId: family.id,
        childId: child.id,
        amount: effectiveAmount,
        idempotencyKey,
        entryType: "ALLOWANCE",
        targetBucket: "DEFAULT_SPLIT",
        referenceId: rule.id,
        description: `${rule.frequency} allowance for ${child.name}`,
        allowAutoTopUp: true,
      });

      const nextRun = computeNextAllowanceRunAt(
        rule.frequency,
        rule.dayOfWeek,
        rule.dayOfMonth,
        now
      );

      await prisma.allowanceRule.update({
        where: { id: rule.id },
        data: {
          lastRunAt: now,
          nextRunAt: nextRun,
        },
      });

      await prisma.notification.createMany({
        data: [
          {
            familyId: family.id,
            childId: child.id,
            type: "ALLOWANCE_PAID",
            title: "Allowance Day!",
            message: `Your $${effectiveAmount.toFixed(2)} allowance has been added to your wallet!`,
            channel: "IN_APP",
          },
          {
            familyId: family.id,
            type: "ALLOWANCE_PAID_PARENT",
            title: `Allowance Paid to ${child.name}`,
            message: `$${effectiveAmount.toFixed(2)} was transferred from your Family Budget to ${child.name}'s wallet.`,
            channel: "IN_APP",
          },
        ],
      });

      await writeAuditLog({
        familyId: family.id,
        actorRole: "SYSTEM_CRON",
        action: "ALLOWANCE_PAID",
        targetType: "AllowanceRule",
        targetId: rule.id,
        details: {
          childId: child.id,
          amountPaid: effectiveAmount.toString(),
          nextRunAt: nextRun.toISOString(),
        },
      });

      summary.paidCount += 1;
      summary.results.push({
        ruleId: rule.id,
        childId: child.id,
        childName: child.name,
        status: "PAID",
        amountPaid: effectiveAmount.toString(),
      });
    } catch {
      // Insufficient family budget (FR-4.3): notify parent and hold for retry
      await prisma.notification.create({
        data: {
          familyId: family.id,
          type: "ALLOWANCE_HELD_INSUFFICIENT_BUDGET",
          title: `Low Family Budget — ${child.name}'s Allowance Held`,
          message: `${child.name}'s $${effectiveAmount.toFixed(2)} allowance could not be paid because your Unallocated Family Budget is too low. Add virtual funds to complete payment.`,
          metadata: {
            ruleId: rule.id,
            childId: child.id,
            requiredAmount: effectiveAmount.toString(),
          },
          channel: "IN_APP",
        },
      });

      summary.heldInsufficientFundsCount += 1;
      summary.results.push({
        ruleId: rule.id,
        childId: child.id,
        childName: child.name,
        status: "HELD_INSUFFICIENT_BUDGET",
        amountPaid: "0.00",
        reason: "Insufficient unallocated family budget",
      });
    }
  }

  return summary;
}
