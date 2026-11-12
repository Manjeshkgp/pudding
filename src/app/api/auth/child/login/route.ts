import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { setSessionCookie, signSessionToken } from "@/lib/jwt";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";
import { childPinSchema, childUsernameSchema } from "@/lib/child-credentials";

const MAX_FAILED_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const childLoginSchema = z.object({
  username: childUsernameSchema,
  pin: childPinSchema,
});

/**
 * POST /api/auth/child/login
 * Authenticates a child with their unique username and the 6-digit PIN set by a parent.
 * Enforces NFR-3: locks the PIN for 15 minutes after 5 failed attempts and alerts parents.
 */
export async function POST(req: NextRequest) {
  try {
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, childLoginSchema);

    enforceRateLimit({
      key: `child-login-ip:${ipAddress}`,
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    enforceRateLimit({
      key: `child-login-user:${input.username}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });

    const child = await prisma.child.findUnique({
      where: { username: input.username },
      include: {
        wallet: true,
        family: true,
      },
    });

    if (!child) {
      throw new ApiError(401, "Invalid username or PIN", "INVALID_CREDENTIALS");
    }

    const family = child.family;

    if (family.isFrozen) {
      throw new ApiError(
        403,
        "Family account is currently paused.",
        "FAMILY_FROZEN",
      );
    }

    if (child.isFrozen) {
      throw new ApiError(
        403,
        "Your account is currently paused by your parent.",
        "CHILD_FROZEN",
      );
    }

    if (!child.pinHash) {
      throw new ApiError(
        403,
        "Your parent needs to connect PayPal and create your PIN before you can log in.",
        "CHILD_PIN_NOT_SET",
      );
    }

    const now = new Date();
    if (child.pinLockedUntil && child.pinLockedUntil > now) {
      const remainingSeconds = Math.ceil(
        (child.pinLockedUntil.getTime() - now.getTime()) / 1000,
      );
      throw new ApiError(
        423,
        "Too many wrong PIN attempts. Ask your parent to reset your PIN or wait 15 minutes.",
        "PIN_LOCKED",
        { retryAfterSeconds: remainingSeconds },
      );
    }

    const pinValid = await bcrypt.compare(input.pin, child.pinHash);

    if (!pinValid) {
      const nextFailedCount =
        child.pinLockedUntil && child.pinLockedUntil <= now
          ? 1
          : child.failedPinAttempts + 1;
      const shouldLock = nextFailedCount >= MAX_FAILED_PIN_ATTEMPTS;
      const lockUntil = shouldLock
        ? new Date(now.getTime() + PIN_LOCKOUT_DURATION_MS)
        : null;

      await prisma.child.update({
        where: { id: child.id },
        data: {
          failedPinAttempts: nextFailedCount,
          pinLockedUntil: lockUntil,
        },
      });

      if (shouldLock) {
        await prisma.notification.create({
          data: {
            familyId: family.id,
            type: "SECURITY_CHILD_PIN_LOCKED",
            title: `PIN Locked for ${child.name}`,
            message: `${child.name}'s account was locked for 15 minutes after ${MAX_FAILED_PIN_ATTEMPTS} failed PIN attempts.`,
            channel: "IN_APP",
          },
        });

        await writeAuditLog({
          familyId: family.id,
          actorChildId: child.id,
          actorRole: "CHILD",
          action: "CHILD_PIN_LOCKOUT",
          targetType: "Child",
          targetId: child.id,
          details: { failedAttempts: nextFailedCount },
          ipAddress,
          userAgent,
        });

        throw new ApiError(
          423,
          "Too many wrong PIN attempts. Your PIN is locked for 15 minutes.",
          "PIN_LOCKED",
          { retryAfterSeconds: PIN_LOCKOUT_DURATION_MS / 1000 },
        );
      }

      throw new ApiError(401, "Invalid username or PIN", "INVALID_PIN", {
        attemptsRemaining: MAX_FAILED_PIN_ATTEMPTS - nextFailedCount,
      });
    }

    if (child.failedPinAttempts > 0 || child.pinLockedUntil) {
      await prisma.child.update({
        where: { id: child.id },
        data: {
          failedPinAttempts: 0,
          pinLockedUntil: null,
        },
      });
    }

    await writeAuditLog({
      familyId: family.id,
      actorChildId: child.id,
      actorRole: "CHILD",
      action: "CHILD_LOGIN",
      targetType: "Child",
      targetId: child.id,
      ipAddress,
      userAgent,
    });

    const token = await signSessionToken({
      sub: child.id,
      subjectType: "CHILD",
      familyId: family.id,
      role: "CHILD",
      name: child.name,
    });

    const response = apiSuccess(
      {
        token,
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
          wallet: child.wallet
            ? {
                id: child.wallet.id,
                spendBalance: child.wallet.spendBalance.toString(),
                saveBalance: child.wallet.saveBalance.toString(),

                defaultSplitSpend: child.wallet.defaultSplitSpend,
                defaultSplitSave: child.wallet.defaultSplitSave,
              }
            : null,
        },
        family: {
          id: family.id,
          name: family.name,
          currency: family.currency,
        },
      },
      200,
      `Welcome back, ${child.name}!`,
    );

    setSessionCookie(response, token, "CHILD");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
