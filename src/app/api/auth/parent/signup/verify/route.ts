import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError, validateBody } from "@/lib/api-response";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getParentSignupDraft } from "@/lib/parent-signup";
import { getRequestMeta } from "@/lib/audit";

const verifySchema = z.object({ code: z.string().regex(/^\d{6}$/, "Code must be 6 digits") });

/** Verifies the OTP for the current parent signup draft. */
export async function POST(req: NextRequest) {
  try {
    const draft = await getParentSignupDraft(req);
    const input = await validateBody(req, verifySchema);
    const { ipAddress } = getRequestMeta(req);
    enforceRateLimit({
      key: `parent-signup-verify:${ipAddress}:${draft.id}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
      errorMessage: "Too many verification attempts. Please request a new code.",
    });

    if (draft.emailVerifiedAt) return apiSuccess({ verified: true, email: draft.email });
    if (!draft.otpHash || !draft.otpExpiresAt || draft.otpExpiresAt.getTime() <= Date.now()) {
      throw new ApiError(400, "Verification code has expired. Please request a new one.", "OTP_EXPIRED");
    }
    if (draft.otpAttempts >= 5) {
      throw new ApiError(429, "Too many incorrect codes. Please request a new one.", "OTP_ATTEMPTS_EXCEEDED");
    }

    const matches = await bcrypt.compare(input.code, draft.otpHash);
    if (!matches) {
      await prisma.parentSignupDraft.update({
        where: { id: draft.id },
        data: { otpAttempts: { increment: 1 } },
      });
      throw new ApiError(400, "Invalid verification code.", "INVALID_OTP");
    }

    await prisma.parentSignupDraft.update({
      where: { id: draft.id },
      data: { emailVerifiedAt: new Date(), otpHash: null, otpExpiresAt: null },
    });
    return apiSuccess({ verified: true, email: draft.email }, 200, "Email verified");
  } catch (error) {
    return handleRouteError(error);
  }
}
