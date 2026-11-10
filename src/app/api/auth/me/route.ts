import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError, validateBody } from "@/lib/api-response";
import { requireAuth, requireParent } from "@/lib/auth-guard";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const updateParentProfileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  avatar: z.enum(["avatar-1", "avatar-2", "avatar-3", "avatar-4", "avatar-5", "avatar-6"]),
});

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
          avatar: user.avatar,
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
          paypalVaultConnected: Boolean(user.paypalVaultId),
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
        username: child.username,
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

/** Updates the signed-in parent profile during onboarding resumption. */
export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireParent(req);
    const input = await validateBody(req, updateParentProfileSchema);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { name: input.name, avatar: input.avatar },
      select: {
        id: true,
        name: true,
        avatar: true,
        email: true,
        role: true,
        permissionLevel: true,
      },
    });
    const { ipAddress, userAgent } = getRequestMeta(req);
    await writeAuditLog({
      familyId: user.familyId,
      actorUserId: user.id,
      actorRole: user.role,
      action: "PARENT_PROFILE_UPDATED",
      targetType: "User",
      targetId: user.id,
      details: { name: updated.name, avatar: updated.avatar },
      ipAddress,
      userAgent,
    });

    return apiSuccess({ user: updated }, 200, "Profile updated successfully");
  } catch (error) {
    return handleRouteError(error);
  }
}
