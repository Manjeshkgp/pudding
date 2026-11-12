import { refreshSignupProgressCookie } from "@/lib/parent-signup";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { getParentSignupDraft, refreshDraftExpiry } from "@/lib/parent-signup";
export async function POST(req: NextRequest) {
  try {
    const draft = await getParentSignupDraft(req);
    if (!draft.passwordHash || !draft.emailVerifiedAt)
      throw new ApiError(
        403,
        "Set your password before continuing.",
        "SIGNUP_STEPS_INCOMPLETE",
      );
    const updatedDraft = await prisma.parentSignupDraft.update({
      where: { id: draft.id },
      data: {
        notificationsCompletedAt: draft.notificationsCompletedAt || new Date(),
        expiresAt: refreshDraftExpiry(),
      },
    });
    const response = apiSuccess({ nextRoute: "/onboarding/security" });
    await refreshSignupProgressCookie(response, updatedDraft);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
