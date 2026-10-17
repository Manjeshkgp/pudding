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
import { computeNextAllowanceRunAt } from "@/jobs/allowance.job";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const createAllowanceSchema = z.object({
  childId: z.string().trim().min(1, "childId is required"),
  amount: z
    .number()
    .positive("Allowance amount must be greater than 0")
    .max(5000),
  frequency: z
    .enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "CUSTOM_DAY"])
    .default("WEEKLY"),
  dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  dayOfMonth: z.number().int().min(1).max(28).optional().nullable(),
  requireAllChores: z.boolean().default(false),
  reduceByMissedChores: z.boolean().default(false),
  nextRunAt: z.string().datetime().optional(),
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
      throw new ApiError(404, "Child not found in your family", "CHILD_NOT_FOUND");
    }

    const nextRunAt = input.nextRunAt
      ? new Date(input.nextRunAt)
      : computeNextAllowanceRunAt(
          input.frequency,
          input.dayOfWeek,
          input.dayOfMonth
        );

    const rule = await prisma.$transaction(async (tx) => {
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
          amount: input.amount,
          frequency: input.frequency,
          dayOfWeek: input.dayOfWeek ?? null,
          dayOfMonth: input.dayOfMonth ?? null,
          requireAllChores: input.requireAllChores,
          reduceByMissedChores: input.reduceByMissedChores,
          status: "ACTIVE",
          nextRunAt,
        },
      });

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
          },
          ipAddress,
          userAgent,
        },
        tx
      );

      return created;
    });

    return apiSuccess(
      {
        ...rule,
        amount: rule.amount.toString(),
      },
      201,
      `Allowance rule set for ${child.name}`
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
