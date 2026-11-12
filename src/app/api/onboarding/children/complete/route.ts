import { refreshSessionNavigation } from "@/lib/refresh-navigation";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requirePrimaryParent } from "@/lib/auth-guard";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { completeOnboardingIfReady, navigationState } from "@/lib/onboarding";
export async function POST(req: NextRequest) {
  try {
    const { user, family } = await requirePrimaryParent(req);
    if (!user.onboardingCompletedAt)
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
        if (!(await tx.child.count({ where: { familyId: family.id } })))
          throw new ApiError(
            409,
            "Add at least one child before continuing.",
            "CHILD_REQUIRED",
          );
        await tx.user.updateMany({
          where: { id: user.id, onboardingChildrenConfirmedAt: null },
          data: { onboardingChildrenConfirmedAt: new Date() },
        });
      });
    await completeOnboardingIfReady(user.id);
    const state = await navigationState(req);
    const response = apiSuccess({ nextRoute: state.nextRoute });
    await refreshSessionNavigation(req, response, state);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
