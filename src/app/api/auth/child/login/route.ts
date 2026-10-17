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

const MAX_FAILED_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes (NFR-3)

const childLoginSchema = z
  .object({
    familyCode: z
      .string()
      .trim()
      .min(4, "Family code is required")
      .max(12)
      .transform((val) => val.toUpperCase()),
    childId: z.string().trim().optional(),
    childName: z.string().trim().optional(),
    pin: z.string().regex(/^[0-9]{4,6}$/, "PIN must be 4 to 6 digits"),
  })
  .refine((data) => Boolean(data.childId || data.childName), {
    message: "Either childId or childName must be provided",
    path: ["childId"],
  });

/**
 * GET /api/auth/child/login?familyCode=XXXXXX
 * Public helper for the Kid Login screen: given a valid 6-char familyCode,
 * returns the list of kid avatars and first names so the child can tap their avatar and enter their PIN (FR-1.5).
 */
export async function GET(req: NextRequest) {
  try {
    const { ipAddress } = getRequestMeta(req);
    enforceRateLimit({
      key: `family-lookup:${ipAddress}`,
      limit: 20,
      windowMs: 5 * 60 * 1000,
    });

    const rawCode = req.nextUrl.searchParams.get("familyCode");
    if (!rawCode) {
      throw new ApiError(400, "familyCode query parameter is required");
    }

    const family = await prisma.family.findUnique({
      where: { familyCode: rawCode.trim().toUpperCase() },
      include: {
        children: {
          select: {
            id: true,
            name: true,
            avatar: true,
            theme: true,
            age: true,
            isFrozen: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!family) {
      throw new ApiError(404, "Family code not found", "FAMILY_NOT_FOUND");
    }

    return apiSuccess({
      familyName: family.name,
      familyCode: family.familyCode,
      children: family.children,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/auth/child/login
 * Authenticates a child using Family Code + Child ID/Name + PIN (never email, FR-1.5).
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

    const family = await prisma.family.findUnique({
      where: { familyCode: input.familyCode },
    });

    if (!family) {
      throw new ApiError(401, "Invalid family code or PIN", "INVALID_CREDENTIALS");
    }

    if (family.isFrozen) {
      throw new ApiError(
        403,
        "Family account is currently paused.",
        "FAMILY_FROZEN"
      );
    }

    const child = await prisma.child.findFirst({
      where: {
        familyId: family.id,
        ...(input.childId
          ? { id: input.childId }
          : { name: { equals: input.childName, mode: "insensitive" } }),
      },
      include: {
        wallet: true,
      },
    });

    if (!child) {
      throw new ApiError(401, "Invalid family code or PIN", "INVALID_CREDENTIALS");
    }

    if (child.isFrozen) {
      throw new ApiError(
        403,
        "Your account is currently paused by your parent.",
        "CHILD_FROZEN"
      );
    }

    // Check active PIN lockout (NFR-3)
    const now = new Date();
    if (child.pinLockedUntil && child.pinLockedUntil > now) {
      const remainingSeconds = Math.ceil(
        (child.pinLockedUntil.getTime() - now.getTime()) / 1000
      );
      throw new ApiError(
        423,
        "Too many wrong PIN attempts. Ask your parent to reset your PIN or wait 15 minutes.",
        "PIN_LOCKED",
        { retryAfterSeconds: remainingSeconds }
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
        // Notify parents of security alert (FR-12.1, NFR-3)
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
          { retryAfterSeconds: PIN_LOCKOUT_DURATION_MS / 1000 }
        );
      }

      throw new ApiError(401, "Invalid PIN", "INVALID_PIN", {
        attemptsRemaining: MAX_FAILED_PIN_ATTEMPTS - nextFailedCount,
      });
    }

    // Successful login: reset failed attempts
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
                giveBalance: child.wallet.giveBalance.toString(),
                lockedPendingBalance:
                  child.wallet.lockedPendingBalance.toString(),
                defaultSplitSpend: child.wallet.defaultSplitSpend,
                defaultSplitSave: child.wallet.defaultSplitSave,
                defaultSplitGive: child.wallet.defaultSplitGive,
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
      `Welcome back, ${child.name}!`
    );

    setSessionCookie(response, token, "CHILD");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
