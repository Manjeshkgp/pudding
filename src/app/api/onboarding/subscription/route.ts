import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, apiSuccess, handleRouteError, validateBody } from "@/lib/api-response";
import { requirePrimaryParent } from "@/lib/auth-guard";
import { navigationState } from "@/lib/onboarding";
import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { subscriptionPlanKeys } from "@/lib/subscription-plans";
import { confirmFamilySubscription, startFamilySubscription } from "@/services/paypal-subscription.service";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), plan: z.enum(subscriptionPlanKeys) }),
  z.object({ action: z.literal("confirm") }),
]);

export async function GET(req: NextRequest) {
  try {
    const { family } = await requirePrimaryParent(req);
    const subscription = await prisma.familySubscription.findUnique({
      where: { familyId: family.id },
      select: { status: true, planKey: true },
    });
    return apiSuccess({ subscription });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, family } = await requirePrimaryParent(req);
    const input = await validateBody(req, actionSchema);
    enforceRateLimit({ key: `subscription-checkout:${user.id}`, limit: 12, windowMs: 60000 });
    if (user.onboardingCompletedAt)
      return apiSuccess({ nextRoute: "/family" });
    if (!user.onboardingChildrenConfirmedAt ||
      !(await prisma.child.count({ where: { familyId: family.id } }))) {
      throw new ApiError(409, "Confirm at least one child before choosing a plan.", "CHILD_REQUIRED");
    }

    const subscription = input.action === "start"
      ? await startFamilySubscription(family.id, input.plan)
      : await confirmFamilySubscription(family.id);

    if (subscription?.status === "ACTIVE") {
      const state = await navigationState(req);
      // Continue refreshes navigation after the parent acknowledges the result.
      return apiSuccess({
        status: subscription.status,
        planKey: subscription.planKey,
        nextRoute: state.nextRoute,
      });
    }
    return apiSuccess({
      status: subscription?.status ?? null,
      ...(input.action === "start" && subscription?.status === "APPROVAL_PENDING" && subscription.approvalUrl
        ? { approvalUrl: subscription.approvalUrl }
        : {}),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
