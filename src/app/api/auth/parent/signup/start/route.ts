import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError, validateBody } from "@/lib/api-response";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  refreshDraftExpiry,
  setParentSignupCookie,
  signParentSignupToken,
} from "@/lib/parent-signup";
import { generateSixDigitOtp } from "@/services/verification.service";
import { sendOtpEmail } from "@/services/email.service";
import { getRequestMeta } from "@/lib/audit";

const startSchema = z.object({
  email: z.string().trim().email("Valid email address is required").toLowerCase(),
});

/** Starts or resends the email step in the staged parent signup flow. */
export async function POST(req: NextRequest) {
  try {
    const input = await validateBody(req, startSchema);
    const { ipAddress } = getRequestMeta(req);
    enforceRateLimit({
      key: `parent-signup:${ipAddress}:${input.email}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
      errorMessage: "Too many signup code requests. Please wait before trying again.",
    });

    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existingUser) {
      throw new ApiError(409, "An account with this email already exists", "EMAIL_ALREADY_EXISTS");
    }

    const existingDraft = await prisma.parentSignupDraft.findUnique({
      where: { email: input.email },
    });
    if (existingDraft?.emailVerifiedAt && existingDraft.expiresAt.getTime() > Date.now()) {
      throw new ApiError(409, "This email is already verified in the current signup. Continue that signup or start again after it expires.", "SIGNUP_ALREADY_VERIFIED");
    }

    const otpCode = generateSixDigitOtp();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const expiresAt = refreshDraftExpiry();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const draft = await prisma.parentSignupDraft.upsert({
      where: { email: input.email },
      create: {
        email: input.email,
        otpHash,
        otpExpiresAt,
        expiresAt,
      },
      update: {
        otpHash,
        otpExpiresAt,
        otpAttempts: 0,
        emailVerifiedAt: null,
        passwordHash: null,
        securityQuestions: Prisma.DbNull,
        expiresAt,
      },
    });

    const delivery = await sendOtpEmail({
      to: input.email,
      otpCode,
      purposeLabel: "Email Verification",
      expiresInMinutes: 10,
    });
    const signupToken = await signParentSignupToken(draft.id);
    const response = apiSuccess({
      email: draft.email,
      expiresAt: otpExpiresAt,
      delivery,
      ...(process.env.NODE_ENV !== "production" && process.env.EXPOSE_DEV_OTP !== "false"
        ? { devOtpCode: otpCode }
        : {}),
    }, 200, "Verification code sent");
    setParentSignupCookie(response, signupToken);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
