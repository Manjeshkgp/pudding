import { enforceRateLimit } from "@/lib/rate-limit";
import { NextRequest } from "next/server";
import { z } from "zod";
import { VerificationPurpose } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/jwt";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import {
  issueVerificationOtp,
  VerificationChannel,
} from "@/services/verification.service";

const sendCodeSchema = z.object({
  channel: z.enum(["EMAIL", "SMS"]).optional().default("EMAIL"),
  purpose: z
    .enum(["EMAIL_VERIFY", "PHONE_VERIFY", "PASSWORD_RESET"])
    .optional()
    .default("EMAIL_VERIFY"),
  target: z.string().min(3).optional(),
});

/**
 * POST /api/auth/verify/send-code
 * Sends a 6-digit OTP via Resend Email (or pluggable SMS adapter) for:
 * - EMAIL_VERIFY
 * - PHONE_VERIFY
 * - PASSWORD_RESET
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = sendCodeSchema.parse(body);

    const session = await getSessionFromRequest(req);
    let userId: string | null = null;
    let recipientName: string | undefined;
    let target = parsed.target?.trim();

    if (session && session.subjectType === "USER") {
      const user = await prisma.user.findUnique({
        where: { id: session.sub },
        select: { id: true, name: true, email: true, phone: true },
      });

      if (user) {
        userId = user.id;
        recipientName = user.name;
        if (!target) {
          target =
            parsed.channel === "SMS" || parsed.purpose === "PHONE_VERIFY"
              ? user.phone || undefined
              : user.email;
        }
      }
    }

    if (!target) {
      throw new ApiError(
        400,
        "Target email or phone number is required when not provided by session.",
        "VALIDATION_ERROR",
      );
    }

    if (!userId) {
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ email: target.toLowerCase() }, { phone: target }],
        },
        select: { id: true, name: true },
      });

      if (!existingUser) {
        throw new ApiError(
          404,
          "No parent account found matching that email or phone.",
          "USER_NOT_FOUND",
        );
      }

      userId = existingUser.id;
      recipientName = existingUser.name;
    }

    enforceRateLimit({
      key: `verification-send:${userId}:${parsed.purpose}`,
      limit: 5,
      windowMs: 900000,
    });
    const channel: VerificationChannel =
      parsed.purpose === "PHONE_VERIFY" ? "SMS" : parsed.channel;

    const result = await issueVerificationOtp({
      userId,
      target,
      channel,
      purpose: parsed.purpose as VerificationPurpose,
      recipientName,
      expiresInMinutes: 10,
    });

    return apiSuccess({
      message:
        channel === "EMAIL"
          ? `Verification code sent to ${result.target}`
          : `SMS verification code generated for ${result.target} (SMS provider: ${result.delivery.provider})`,
      ...result,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
