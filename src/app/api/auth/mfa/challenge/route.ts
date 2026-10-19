import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/jwt";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
} from "@/lib/api-response";
import { issueVerificationOtp } from "@/services/verification.service";

const mfaChallengeSchema = z.object({
  method: z
    .enum(["EMAIL_OTP", "SMS_OTP", "SECURITY_QUESTION"])
    .optional()
    .default("EMAIL_OTP"),
  actionScope: z
    .string()
    .max(80)
    .optional()
    .default("SENSITIVE_PARENT_ACTION"),
});

/**
 * POST /api/auth/mfa/challenge
 * Initiates a step-up MFA challenge (`NFR-2`) for an authenticated Parent before
 * high-risk actions (e.g., increasing spending limits, changing PIN/password,
 * approving high-value PayPal payouts).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || session.subjectType !== "USER") {
      throw new ApiError(
        401,
        "Parent authentication required to initiate an MFA challenge.",
        "UNAUTHORIZED"
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = mfaChallengeSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      include: {
        securityQuestions: {
          select: {
            questionKey: true,
            questionText: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!user) {
      throw new ApiError(404, "Parent user not found.", "USER_NOT_FOUND");
    }

    if (parsed.method === "SECURITY_QUESTION") {
      if (user.securityQuestions.length === 0) {
        throw new ApiError(
          400,
          "No security questions are configured for this account. Please set up security questions first or use EMAIL_OTP.",
          "NO_SECURITY_QUESTIONS"
        );
      }

      return apiSuccess({
        challengeType: "SECURITY_QUESTION",
        actionScope: parsed.actionScope,
        questions: user.securityQuestions,
        message: "Please answer one of your configured security questions.",
      });
    }

    const channel = parsed.method === "SMS_OTP" ? "SMS" : "EMAIL";
    const target =
      channel === "SMS" ? user.phone || user.email : user.email;

    const otpResult = await issueVerificationOtp({
      userId: user.id,
      target,
      channel,
      purpose: "MFA_CHALLENGE",
      recipientName: user.name,
      expiresInMinutes: 10,
    });

    return apiSuccess({
      challengeType: parsed.method,
      actionScope: parsed.actionScope,
      ...otpResult,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
