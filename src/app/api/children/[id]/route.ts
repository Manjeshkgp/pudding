import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import {
  requireChildOrFamilyParent,
  requireParent,
} from "@/lib/auth-guard";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const updateChildSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  age: z.number().int().min(6).max(17).optional(),
  avatar: z.string().trim().max(100).optional(),
  theme: z.string().trim().max(50).optional(),
  isFrozen: z.boolean().optional(),
  quietHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .optional(),
  quietHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .optional(),
});

/**
 * GET /api/children/[id]
 * Accessible by the Child themselves or a Parent in the same family (FR-11.4).
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { child, isParent } = await requireChildOrFamilyParent(req, id);

    const fullChild = await prisma.child.findUnique({
      where: { id: child.id },
      include: {
        wallet: true,
        spendingRule: isParent,
        allowanceRules: {
          where: { status: { not: "CANCELLED" } },
        },
        savingsGoals: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "desc" },
        },
        earnedBadges: {
          include: { badge: true },
        },
      },
    });

    if (!fullChild) {
      throw new ApiError(404, "Child not found", "CHILD_NOT_FOUND");
    }

    return apiSuccess({
      id: fullChild.id,
      name: fullChild.name,
      age: fullChild.age,
      avatar: fullChild.avatar,
      theme: fullChild.theme,
      isFrozen: fullChild.isFrozen,
      quietHoursStart: fullChild.quietHoursStart,
      quietHoursEnd: fullChild.quietHoursEnd,
      streakCount: fullChild.streakCount,
      level: fullChild.level,
      xp: fullChild.xp,
      wallet: fullChild.wallet
        ? {
            id: fullChild.wallet.id,
            spendBalance: fullChild.wallet.spendBalance.toString(),
            saveBalance: fullChild.wallet.saveBalance.toString(),
            giveBalance: fullChild.wallet.giveBalance.toString(),
            lockedPendingBalance:
              fullChild.wallet.lockedPendingBalance.toString(),
            defaultSplitSpend: fullChild.wallet.defaultSplitSpend,
            defaultSplitSave: fullChild.wallet.defaultSplitSave,
            defaultSplitGive: fullChild.wallet.defaultSplitGive,
            isFrozen: fullChild.wallet.isFrozen,
          }
        : null,
      allowanceRules: fullChild.allowanceRules,
      savingsGoals: fullChild.savingsGoals,
      earnedBadges: fullChild.earnedBadges,
      ...(isParent ? { spendingRule: fullChild.spendingRule } : {}),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PATCH /api/children/[id]
 * Updates child profile settings (Parent can update all fields; Child can update avatar/theme).
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { session, child, isParent } = await requireChildOrFamilyParent(
      req,
      id
    );
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, updateChildSchema);

    // Children can only customize their avatar and theme (FR-11.3)
    const updateData: Prisma.ChildUpdateInput = isParent
      ? {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.age !== undefined ? { age: input.age } : {}),
          ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
          ...(input.theme !== undefined ? { theme: input.theme } : {}),
          ...(input.isFrozen !== undefined ? { isFrozen: input.isFrozen } : {}),
          ...(input.quietHoursStart !== undefined
            ? { quietHoursStart: input.quietHoursStart }
            : {}),
          ...(input.quietHoursEnd !== undefined
            ? { quietHoursEnd: input.quietHoursEnd }
            : {}),
        }
      : {
          ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
          ...(input.theme !== undefined ? { theme: input.theme } : {}),
        };

    const updatedChild = await prisma.child.update({
      where: { id: child.id },
      data: updateData,
    });

    await writeAuditLog({
      familyId: child.familyId,
      actorUserId: isParent ? session.sub : null,
      actorChildId: !isParent ? session.sub : null,
      actorRole: session.role,
      action: "CHILD_PROFILE_UPDATED",
      targetType: "Child",
      targetId: child.id,
      details: input as Record<string, unknown>,
      ipAddress,
      userAgent,
    });

    return apiSuccess(updatedChild, 200, "Child profile updated");
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * DELETE /api/children/[id]
 * Removes a child profile and returns any virtual wallet funds back to the Family Unallocated Budget (FR-10.5).
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, family } = await requireParent(req, "canManageChildren");
    const { ipAddress, userAgent } = getRequestMeta(req);

    const child = await prisma.child.findUnique({
      where: { id },
      include: { wallet: true },
    });

    if (!child || child.familyId !== family.id) {
      throw new ApiError(404, "Child not found in your family", "CHILD_NOT_FOUND");
    }

    if (
      child.wallet &&
      child.wallet.lockedPendingBalance.greaterThan(new Prisma.Decimal(0))
    ) {
      throw new ApiError(
        409,
        "Cannot remove child while a PayPal payment is still pending recipient claim",
        "PENDING_PAYPAL_CLAIM_EXISTS"
      );
    }

    await prisma.$transaction(async (tx) => {
      const totalChildFunds = child.wallet
        ? child.wallet.spendBalance
            .plus(child.wallet.saveBalance)
            .plus(child.wallet.giveBalance)
        : new Prisma.Decimal(0);

      if (totalChildFunds.greaterThan(new Prisma.Decimal(0))) {
        await tx.family.update({
          where: { id: family.id },
          data: {
            unallocatedBudget: {
              increment: totalChildFunds,
            },
          },
        });

        await tx.ledgerEntry.create({
          data: {
            familyId: family.id,
            childId: child.id,
            walletBucket: "FAMILY_BUDGET",
            amount: totalChildFunds,
            direction: "CREDIT",
            type: "REVERSAL",
            status: "COMPLETED",
            idempotencyKey: `remove-child-return:${child.id}:${Date.now()}`,
            actorUserId: user.id,
            description: `Returned virtual balance from removed child profile (${child.name}) to Family Unallocated Budget`,
          },
        });
      }

      await writeAuditLog(
        {
          familyId: family.id,
          actorUserId: user.id,
          actorRole: user.role,
          action: "CHILD_PROFILE_DELETED",
          targetType: "Child",
          targetId: child.id,
          details: {
            childName: child.name,
            returnedVirtualFunds: totalChildFunds.toString(),
          },
          ipAddress,
          userAgent,
        },
        tx
      );

      await tx.child.delete({
        where: { id: child.id },
      });
    });

    return apiSuccess(
      { deletedChildId: child.id },
      200,
      "Child profile deleted and remaining virtual funds returned to family budget"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
