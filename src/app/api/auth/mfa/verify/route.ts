import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/jwt";
import { signStepUpMfaToken } from "@/lib/mfa-token";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
} from "@/lib/api-response";
import { verifyOtpCode } from "@/services/verification.service";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const mfaVerifySchema = z
  .object({
    method: z
      .enum(["EMAIL_OTP", "SMS_OTP", "SECURITY_QUESTION"])
      .optional()
      .default("EMAIL_OTP"),
    code: z.string().length(6).optional(),
    questionKey: z.string().min(2).optional(),
    answer: z.string().min(1).optional(),
    actionScope: z
      .string()
      .max(80)
      .optional()
      .default("SENSITIVE_PARENT_ACTION"),
    enableMfaOnProfile: z.boolean().optional().default(true),
  })
  .refine(
    (data) =>
      (data.method === "SECURITY_QUESTION" &&
        Boolean(data.questionKey && data.answer)) ||
      (data.method !== "SECURITY_QUESTION" && Boolean(data.code)),
    {
      message:
        "Provide a 6-digit `code` for OTP methods, or `questionKey` + `answer` for SECURITY_QUESTION.",
    }
  );

/**
 * POST /api/auth/mfa/verify
 * Verifies a Parent's step-up MFA challenge (`NFR-2`) via Email OTP, SMS OTP,
 * or Security Question, and returns a signed 15-minute `mfaStepUpToken`.
 */
export async function POST(req: NextRequest) {
  try {
    const { ipAddress, userAgent } = getRequestMeta(req);
    const session = await getSessionFromRequest(req);
    if (!session || session.subjectType !== "USER") {
      throw new ApiError(
        401,
        "Parent authentication required to verify MFA.",
        "UNAUTHORIZED"
      );
    }

    const body = await req.json();
    const parsed = mfaVerifySchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      include: { securityQuestions: true },
    });

    if (!user) {
      throw new ApiError(404, "Parent user not found.", "USER_NOT_FOUND");
    }

    if (parsed.method === "SECURITY_QUESTION") {
      const questionRecord = user.securityQuestions.find(
        (q) => q.questionKey === parsed.questionKey
      );
      if (!questionRecord) {
        throw new ApiError(
          404,
          "Configured security question not found.",
          "SECURITY_QUESTION_NOT_FOUND"
        );
      }

      const normalizedAnswer = (parsed.answer || "").trim().toLowerCase();
      const isMatch = await bcrypt.compare(
        normalizedAnswer,
        questionRecord.answerHash
      );

      if (!isMatch) {
        throw new ApiError(
          401,
          "Incorrect security question answer.",
          "INVALID_SECURITY_ANSWER"
        );
      }
    } else {
      const target =
        parsed.method === "SMS_OTP" ? user.phone || user.email : user.email;

      const check = await verifyOtpCode({
        target,
        purpose: "MFA_CHALLENGE",
        code: parsed.code!,
      });

      if (!check.valid) {
        throw new ApiError(
          401,
          check.reason || "Invalid or expired MFA verification code.",
          "INVALID_MFA_CODE"
        );
      }
    }

    if (parsed.enableMfaOnProfile && !user.mfaEnabled) {
      await prisma.user.update({
        where: { id: user.id },
        data: { mfaEnabled: true },
      });
    }

    const mfaStepUpToken = await signStepUpMfaToken({
      sub: user.id,
      familyId: session.familyId,
      method: parsed.method,
      actionScope: parsed.actionScope,
    });

    await writeAuditLog({
      familyId: session.familyId,
      actorUserId: user.id,
      actorRole: user.role,
      action: "PARENT_MFA_VERIFIED",
      targetType: "User",
      targetId: user.id,
      details: {
        method: parsed.method,
        actionScope: parsed.actionScope,
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess({
      verified: true,
      method: parsed.method,
      actionScope: parsed.actionScope,
      mfaEnabled: true,
      mfaStepUpToken,
      expiresInSeconds: 900,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
