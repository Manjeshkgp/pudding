import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError, validateBody } from "@/lib/api-response";
import { getParentSignupDraft, refreshDraftExpiry } from "@/lib/parent-signup";

const passwordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
});

/** Saves the password hash after signup email verification. */
export async function POST(req: NextRequest) {
  try {
    const draft = await getParentSignupDraft(req);
    const input = await validateBody(req, passwordSchema);
    if (!draft.emailVerifiedAt) {
      throw new ApiError(403, "Verify your email before setting a password", "EMAIL_NOT_VERIFIED");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    await prisma.parentSignupDraft.update({
      where: { id: draft.id },
      data: { passwordHash, expiresAt: refreshDraftExpiry() },
    });
    return apiSuccess({ passwordSaved: true }, 200, "Password saved");
  } catch (error) {
    return handleRouteError(error);
  }
}
