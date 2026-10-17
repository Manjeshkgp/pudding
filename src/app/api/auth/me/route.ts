import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    if (session.subjectType === "USER") {
      const user = await prisma.user.findUnique({
        where: { id: session.sub },
        include: {
          family: {
            include: {
              children: {
                select: {
                  id: true,
                  name: true,
                  age: true,
                  avatar: true,
                  theme: true,
                  isFrozen: true,
                  streakCount: true,
                  level: true,
                  xp: true,
                  wallet: true,
                },
                orderBy: { createdAt: "asc" },
              },
            },
          },
          notificationPreference: true,
        },
      });

      if (!user) {
        throw new ApiError(404, "User not found", "USER_NOT_FOUND");
      }

      return apiSuccess({
        subjectType: "USER",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          permissionLevel: user.permissionLevel,
          permissions: user.permissions,
          isEmailVerified: user.isEmailVerified,
          isKycSimulatedVerified: user.isKycSimulatedVerified,
          paypalPayerId: user.paypalPayerId,
          paypalVerifiedEmail: user.paypalVerifiedEmail,
          paypalIsVerified: user.paypalIsVerified,
          paypalLinkedAt: user.paypalLinkedAt,
          mfaEnabled: user.mfaEnabled,
          notificationPreference: user.notificationPreference,
        },
        family: user.family
          ? {
              id: user.family.id,
              name: user.family.name,
              familyCode: user.family.familyCode,
              currency: user.family.currency,
              unallocatedBudget: user.family.unallocatedBudget.toString(),
              autoTopUpAmount: user.family.autoTopUpAmount?.toString() ?? null,
              autoTopUpThreshold:
                user.family.autoTopUpThreshold?.toString() ?? null,
              autoTopUpSchedule: user.family.autoTopUpSchedule,
              siblingLeaderboardEnabled: user.family.siblingLeaderboardEnabled,
              isFrozen: user.family.isFrozen,
              children: user.family.children.map((child) => ({
                ...child,
                wallet: child.wallet
                  ? {
                      id: child.wallet.id,
                      spendBalance: child.wallet.spendBalance.toString(),
                      saveBalance: child.wallet.saveBalance.toString(),
                      giveBalance: child.wallet.giveBalance.toString(),
                      lockedPendingBalance:
                        child.wallet.lockedPendingBalance.toString(),
                      defaultSplitSpend: child.wallet.defaultSplitSpend,
                      defaultSplitSave: child.wallet.defaultSplitSave,
                      defaultSplitGive: child.wallet.defaultSplitGive,
                      isFrozen: child.wallet.isFrozen,
                    }
                  : null,
              })),
            }
          : null,
      });
    }

    // Child session (FR-11.4: strictly scoped to own data; never exposes parent or family unallocated budget)
    const child = await prisma.child.findUnique({
      where: { id: session.sub },
      include: {
        wallet: true,
        earnedBadges: {
          include: { badge: true },
        },
        family: {
          select: {
            id: true,
            name: true,
            currency: true,
            siblingLeaderboardEnabled: true,
          },
        },
      },
    });

    if (!child) {
      throw new ApiError(404, "Child profile not found", "CHILD_NOT_FOUND");
    }

    return apiSuccess({
      subjectType: "CHILD",
      child: {
        id: child.id,
        name: child.name,
        age: child.age,
        avatar: child.avatar,
        theme: child.theme,
        streakCount: child.streakCount,
        level: child.level,
        xp: child.xp,
        isFrozen: child.isFrozen,
        quietHoursStart: child.quietHoursStart,
        quietHoursEnd: child.quietHoursEnd,
        wallet: child.wallet
          ? {
              id: child.wallet.id,
              spendBalance: child.wallet.spendBalance.toString(),
              saveBalance: child.wallet.saveBalance.toString(),
              giveBalance: child.wallet.giveBalance.toString(),
              lockedPendingBalance: child.wallet.lockedPendingBalance.toString(),
              defaultSplitSpend: child.wallet.defaultSplitSpend,
              defaultSplitSave: child.wallet.defaultSplitSave,
              defaultSplitGive: child.wallet.defaultSplitGive,
              isFrozen: child.wallet.isFrozen,
            }
          : null,
        earnedBadges: child.earnedBadges,
      },
      family: {
        id: child.family.id,
        name: child.family.name,
        currency: child.family.currency,
        siblingLeaderboardEnabled: child.family.siblingLeaderboardEnabled,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
