import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { requireAuth, requireParent } from "@/lib/auth-guard";
import { computeNextAllowanceRunAt } from "@/jobs/allowance.job";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";
import { chorePeriod } from "@/lib/chore-period";
import { creditScheduledAllowance } from "@/services/scheduled-allowance.service";

const createAllowanceSchema = z.object({
  childId: z.string().trim().min(1, "childId is required"),
  amount: z
    .number()
    .positive("Allowance amount must be greater than 0")
    .multipleOf(0.01)
    .max(5000),
  frequency: z
    .enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "CUSTOM_DAY"])
    .default("WEEKLY"),
  dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  dayOfMonth: z.number().int().min(1).max(28).optional().nullable(),
  requireAllChores: z.boolean().default(false),
  reduceByMissedChores: z.boolean().default(false),
  nextRunAt: z.string().datetime().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

/**
 * GET /api/allowances
 * Lists allowance rules for the family (Parent) or own allowance schedule for a Child (FR-4.1, FR-3.2).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const childIdParam = req.nextUrl.searchParams.get("childId");

    if (session.subjectType === "CHILD") {
      const rules = await prisma.allowanceRule.findMany({
        where: {
          childId: session.sub,
          status: { not: "CANCELLED" },
        },
        orderBy: { createdAt: "desc" },
      });

      return apiSuccess({
        allowanceRules: rules.map((r) => ({
          ...r,
          amount: r.amount.toString(),
        })),
      });
    }

    const { family } = await requireParent(req);

    const rules = await prisma.allowanceRule.findMany({
      where: {
        child: { familyId: family.id },
        status: { not: "CANCELLED" },
        ...(childIdParam ? { childId: childIdParam } : {}),
      },
      include: {
        child: {
          select: { id: true, name: true, avatar: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess({
      allowanceRules: rules.map((r) => ({
        ...r,
        amount: r.amount.toString(),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/allowances
 * Parent creates or replaces an allowance schedule for a child (FR-4.1, FR-4.5).
 */
export async function POST(req: NextRequest) {
  try {
    const { user, family } = await requireParent(req, "canManageAllowances");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, createAllowanceSchema);

    const child = await prisma.child.findUnique({
      where: { id: input.childId },
    });

    if (!child || child.familyId !== family.id) {
      throw new ApiError(
        404,
        "Child not found in your family",
        "CHILD_NOT_FOUND",
      );
    }

    const creationKey = input.idempotencyKey
      ? createHash("sha256")
          .update(`${family.id}:${input.idempotencyKey}`)
          .digest("hex")
      : undefined;

    const rule = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Family" WHERE "id" = ${family.id} FOR UPDATE`;
      if (creationKey) {
        const existing = await tx.allowanceRule.findUnique({
          where: { creationKey },
        });
        if (existing) {
          if (
            existing.childId !== child.id ||
            !existing.amount.equals(input.amount) ||
            existing.frequency !== input.frequency
          )
            throw new ApiError(
              409,
              "This request key belongs to another allowance schedule.",
              "IDEMPOTENCY_CONFLICT",
            );
          return existing;
        }
      }
      const now = new Date();
      // Explicit start dates and older conditional schedules keep their calendar behavior.
      const period =
        !input.nextRunAt &&
        input.dayOfWeek == null &&
        input.dayOfMonth == null &&
        !input.requireAllChores &&
        !input.reduceByMissedChores
          ? chorePeriod(input.frequency, now, now)
          : null;
      const nextRunAt = input.nextRunAt
        ? new Date(input.nextRunAt)
        : (period?.end ??
          computeNextAllowanceRunAt(
            input.frequency,
            input.dayOfWeek,
            input.dayOfMonth,
            now,
          ));

      if (period) {
        if (!creationKey)
          throw new ApiError(
            400,
            "An idempotency key is required to start an allowance now.",
            "IDEMPOTENCY_KEY_REQUIRED",
          );
        await tx.$queryRaw`SELECT "id" FROM "Wallet" WHERE "childId" = ${child.id} FOR UPDATE`;
        const current = await tx.child.findFirst({
          where: { id: child.id, familyId: family.id },
          select: { isFrozen: true, wallet: { select: { isFrozen: true } } },
        });
        if (!current?.wallet || current.isFrozen || current.wallet.isFrozen)
          throw new ApiError(
            409,
            "This child’s wallet must be active before you can add an allowance.",
            "WALLET_INACTIVE",
          );
      }
      // Cancel any previous active allowance rule for this child so they have one clean schedule
      await tx.allowanceRule.updateMany({
        where: {
          childId: child.id,
          status: { in: ["ACTIVE", "PAUSED"] },
        },
        data: { status: "CANCELLED" },
      });

      const created = await tx.allowanceRule.create({
        data: {
          childId: child.id,
          creationKey,
          amount: input.amount,
          frequency: input.frequency,
          dayOfWeek: input.dayOfWeek ?? null,
          dayOfMonth: input.dayOfMonth ?? null,
          requireAllChores: input.requireAllChores,
          reduceByMissedChores: input.reduceByMissedChores,
          status: "ACTIVE",
          nextRunAt,
          anchorAt: period ? now : null,
          lastRunAt: period ? now : null,
        },
      });

      if (period) {
        await creditScheduledAllowance(tx, {
          ruleId: created.id,
          familyId: family.id,
          childId: child.id,
          childName: child.name,
          amount: created.amount,
          dueAt: now,
          actorUserId: user.id,
        });
      }

      await writeAuditLog(
        {
          familyId: family.id,
          actorUserId: user.id,
          actorRole: user.role,
          action: "ALLOWANCE_RULE_CREATED",
          targetType: "AllowanceRule",
          targetId: created.id,
          details: {
            childId: child.id,
            amount: created.amount.toString(),
            frequency: created.frequency,
            nextRunAt: created.nextRunAt.toISOString(),
            firstCredit: period ? created.amount.toFixed(2) : null,
          },
          ipAddress,
          userAgent,
        },
        tx,
      );

      return created;
    });

    return apiSuccess(
      {
        ...rule,
        amount: rule.amount.toString(),
        firstCreditApplied: Boolean(rule.anchorAt && rule.lastRunAt),
      },
      201,
      `Allowance rule set for ${child.name}`,
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
