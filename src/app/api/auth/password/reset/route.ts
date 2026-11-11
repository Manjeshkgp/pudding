import { enforceRateLimit } from "@/lib/rate-limit";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { verifyOtpCode } from "@/services/verification.service";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const passwordResetSchema = z
  .object({
    email: z.string().email("Valid email address is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters"),
    otpCode: z.string().length(6).optional(),
    securityQuestionKey: z.string().min(1).optional(),
    securityQuestionAnswer: z.string().min(1).optional(),
  })
  .refine(
    (data) =>
      Boolean(data.otpCode) ||
      Boolean(data.securityQuestionKey && data.securityQuestionAnswer),
    {
      message:
        "Provide either a 6-digit otpCode or a securityQuestionKey + securityQuestionAnswer.",
    },
  );

/**
 * POST /api/auth/password/reset
 * Resets a Parent's password using either:
 * 1) A 6-digit Email OTP (`purpose: "PASSWORD_RESET"` from `/api/auth/verify/send-code`), OR
 * 2) A configured Parent Security Question + Answer.
 */
export async function POST(req: NextRequest) {
  try {
    const { ipAddress, userAgent } = getRequestMeta(req);
    const body = await req.json();
    const parsed = passwordResetSchema.parse(body);

    enforceRateLimit({
      key: `password-reset:${ipAddress}`,
      limit: 10,
      windowMs: 900000,
    });
    const normalizedEmail = parsed.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        securityQuestions: true,
      },
    });

    if (!user) {
      throw new ApiError(
        404,
        "No parent account found with that email address.",
        "USER_NOT_FOUND",
      );
    }

    let verifiedBy: "OTP" | "SECURITY_QUESTION" | null = null;

    if (parsed.otpCode) {
      const otpCheck = await verifyOtpCode({
        target: normalizedEmail,
        purpose: "PASSWORD_RESET",
        code: parsed.otpCode,
      });

      if (!otpCheck.valid) {
        throw new ApiError(
          400,
          otpCheck.reason || "Invalid or expired password reset OTP.",
          "INVALID_OTP",
        );
      }
      verifiedBy = "OTP";
    } else if (parsed.securityQuestionKey && parsed.securityQuestionAnswer) {
      const matchingQuestion = user.securityQuestions.find(
        (q) => q.questionKey === parsed.securityQuestionKey,
      );

      if (!matchingQuestion) {
        throw new ApiError(
          400,
          "That security question is not configured for this account.",
          "SECURITY_QUESTION_NOT_FOUND",
        );
      }

      const normalizedAnswer = parsed.securityQuestionAnswer
        .trim()
        .toLowerCase();
      const isAnswerMatch = await bcrypt.compare(
        normalizedAnswer,
        matchingQuestion.answerHash,
      );

      if (!isAnswerMatch) {
        throw new ApiError(
          401,
          "Incorrect security question answer.",
          "INVALID_SECURITY_ANSWER",
        );
      }
      verifiedBy = "SECURITY_QUESTION";
    }

    const passwordHash = await bcrypt.hash(parsed.newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await writeAuditLog({
      familyId: user.familyId,
      actorUserId: user.id,
      actorRole: user.role,
      action: "PARENT_PASSWORD_RESET",
      targetType: "User",
      targetId: user.id,
      details: { verifiedBy },
      ipAddress,
      userAgent,
    });

    return apiSuccess({
      reset: true,
      verifiedBy,
      message: "Password has been reset successfully. You can now log in.",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
