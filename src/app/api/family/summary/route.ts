import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireParent } from "@/lib/auth-guard";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
import { parentReviewStatuses } from "@/lib/purchase-review";
import { countUnreadParentInbox } from "@/services/parent-inbox.service";
export async function GET(req: NextRequest) {
  try {
    const { user, family } = await requireParent(req);
    const [children, pendingPurchases, pendingChores, notifications] =
      await Promise.all([
        req.nextUrl.searchParams.get("children") === "omit"
          ? Promise.resolve([])
          : prisma.child.findMany({
              where: { familyId: family.id },
              include: { wallet: true, spendingRule: true },
              orderBy: { createdAt: "asc" },
            }),
        prisma.purchase.count({
          where: {
            familyId: family.id,
            status: {
              in: [...parentReviewStatuses, "PROCESSING"],
            },
          },
        }),
        prisma.choreSubmission.count({
          where: { chore: { familyId: family.id }, status: "PENDING" },
        }),
        countUnreadParentInbox(family.id, user.id),
      ]);
    const payer = await prisma.user.findFirst({
      where: { familyId: family.id, role: "PRIMARY_PARENT" },
      select: { paypalVaultId: true },
    });
    return apiSuccess({
      parent: {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        permissionLevel: user.permissionLevel,
        permissions: user.permissions,
        pinSet: Boolean(user.pinHash),
        paypalVaultConnected: Boolean(payer?.paypalVaultId),
      },
      limit: {
        total: family.spendingLimit.toString(),
        spent: family.spentTotal.toString(),
        reserved: family.reservedTotal.toString(),
        available: Prisma.Decimal.max(
          0,
          family.spendingLimit
            .minus(family.spentTotal)
            .minus(family.reservedTotal),
        ).toString(),
        unallocated: family.unallocatedBudget.toString(),
        currency: family.currency,
      },
      children: children.map((c) => ({
        id: c.id,
        name: c.name,
        username: c.username,
        avatar: c.avatar,
        age: c.age,
        isFrozen: c.isFrozen,
        pinSet: Boolean(c.pinHash),
        wallet: c.wallet,
        spendingRule: c.spendingRule,
      })),
      pendingPurchases,
      pendingChores,
      unreadNotifications: notifications,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
