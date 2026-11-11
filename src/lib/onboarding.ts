import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/jwt";
import { getParentSignupDraft } from "@/lib/parent-signup";
import { ApiError } from "@/lib/api-response";

export { draftNextRoute, navigationRedirect } from "@/lib/navigation-policy";
import { draftNextRoute, NavigationState } from "@/lib/navigation-policy";
import type { SessionPayload } from "@/lib/jwt";
export async function completeOnboardingIfReady(userId: string) {
  await prisma.user.updateMany({
    where: {
      id: userId,
      role: "PRIMARY_PARENT",
      onboardingCompletedAt: null,
      onboardingChildrenConfirmedAt: { not: null },
      paypalVaultId: { not: null },
      pinHash: { not: null },
      family: { is: { children: { some: {} } } },
    },
    data: { onboardingCompletedAt: new Date() },
  });
}
export async function accountNavigationState(
  session: SessionPayload | null,
): Promise<NavigationState | null> {
  if (session?.subjectType === "USER") {
    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      include: { family: { select: { isFrozen: true } } },
    });
    if (user && (user.isFrozen || user.family?.isFrozen))
      return {
        kind: "BLOCKED",
        nextRoute: "/account-blocked",
        completed: false,
      };
    if (user?.familyId && ["PRIMARY_PARENT", "CO_PARENT"].includes(user.role)) {
      const completed =
        Boolean(user.onboardingCompletedAt) || user.role === "CO_PARENT";
      if (completed)
        return { kind: "PARENT", nextRoute: "/family", completed: true };
      const childCount = await prisma.child.count({
        where: { familyId: user.familyId },
      });
      if (!user.onboardingChildrenConfirmedAt || !childCount)
        return {
          kind: "PARENT",
          nextRoute: childCount
            ? "/onboarding/children"
            : "/onboarding/add-kid",
          childrenStage: true,
          childCount,
          completed: false,
        };
      if (!user.paypalVaultId)
        return {
          kind: "PARENT",
          nextRoute: "/onboarding/paypal",
          completed: false,
        };
      if (!user.pinHash)
        return {
          kind: "PARENT",
          nextRoute: "/onboarding/pin",
          completed: false,
        };
      await completeOnboardingIfReady(user.id);
      return { kind: "PARENT", nextRoute: "/family", completed: true };
    }
    if (user)
      return {
        kind: "BLOCKED",
        nextRoute: "/account-blocked",
        completed: false,
      };
  } else if (session?.subjectType === "CHILD") {
    const child = await prisma.child.findUnique({
      where: { id: session.sub },
      include: { family: { select: { isFrozen: true } } },
    });
    if (child)
      return {
        kind: child.isFrozen || child.family.isFrozen ? "BLOCKED" : "CHILD",
        nextRoute:
          child.isFrozen || child.family.isFrozen
            ? "/account-blocked"
            : "/home",
        completed: true,
      };
  }
  return null;
}

export async function navigationState(
  req: NextRequest,
): Promise<NavigationState> {
  const state = await accountNavigationState(await getSessionFromRequest(req));
  if (state) return state;
  try {
    const draft = await getParentSignupDraft(req);
    return {
      kind: "DRAFT",
      nextRoute: draftNextRoute(draft),
      completed: false,
    };
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 401) throw error;
    return { kind: "GUEST", nextRoute: "/onboarding/email", completed: false };
  }
}
