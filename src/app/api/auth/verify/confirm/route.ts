import { NextRequest } from "next/server";
import { z } from "zod";
import { VerificationPurpose } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/jwt";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
} from "@/lib/api-response";
import { verifyOtpCode } from "@/services/verification.service";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const confirmCodeSchema = z.object({
  purpose: z
    .enum(["EMAIL_VERIFY", "PHONE_VERIFY"])
    .optional()
    .default("EMAIL_VERIFY"),
  target: z.string().min(3).optional(),
  code: z.string().length(6, "OTP code must be 6 digits"),
});

/**
 * POST /api/auth/verify/confirm
 * Confirms a 6-digit OTP for EMAIL_VERIFY or PHONE_VERIFY and marks the parent's
 * `isEmailVerified = true` / `phone` in PostgreSQL.
 */
export async function POST(req: NextRequest) {
  try {
    const { ipAddress, userAgent } = getRequestMeta(req);
    const body = await req.json();
    const parsed = confirmCodeSchema.parse(body);

    const session = await getSessionFromRequest(req);
    let target = parsed.target?.trim();
    let sessionUserId: string | null = null;

    if (session && session.subjectType === "USER") {
      sessionUserId = session.sub;
      if (!target) {
        const user = await prisma.user.findUnique({
          where: { id: session.sub },
          select: { email: true, phone: true },
        });
        if (user) {
          target =
            parsed.purpose === "PHONE_VERIFY"
              ? user.phone || undefined
              : user.email;
        }
      }
    }

    if (!target) {
      throw new ApiError(
        400,
        "Target email or phone number is required.",
        "VALIDATION_ERROR"
      );
    }

    const check = await verifyOtpCode({
      target,
      purpose: parsed.purpose as VerificationPurpose,
      code: parsed.code,
    });

    if (!check.valid) {
      throw new ApiError(
        400,
        check.reason || "Invalid or expired verification code.",
        "INVALID_OTP"
      );
    }

    const userIdToUpdate = check.userId || sessionUserId;
    let updatedUser = null;

    if (userIdToUpdate) {
      updatedUser = await prisma.user.update({
        where: { id: userIdToUpdate },
        data:
          parsed.purpose === "PHONE_VERIFY"
            ? { phone: target }
            : { isEmailVerified: true },
        select: {
          id: true,
          familyId: true,
          role: true,
          email: true,
          phone: true,
          isEmailVerified: true,
        },
      });

      await writeAuditLog({
        familyId: updatedUser.familyId,
        actorUserId: updatedUser.id,
        actorRole: updatedUser.role,
        action:
          parsed.purpose === "PHONE_VERIFY"
            ? "PARENT_PHONE_VERIFIED"
            : "PARENT_EMAIL_VERIFIED",
        targetType: "User",
        targetId: updatedUser.id,
        details: { target },
        ipAddress,
        userAgent,
      });
    }

    return apiSuccess({
      verified: true,
      purpose: parsed.purpose,
      target: target.toLowerCase(),
      user: updatedUser,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
