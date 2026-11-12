import { jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { getJwtSecretKey } from "@/lib/auth-secret";
import { stateFromClaim } from "@/lib/navigation-claims";
import type { NavigationState } from "@/lib/navigation-policy";
export const SIGNUP_STEPS = [
  "/onboarding/verify",
  "/onboarding/password",
  "/onboarding/notifications",
  "/onboarding/security",
  "/onboarding/security-2",
  "/onboarding/profile",
] as const;
export async function cookieNavigationState(
  req: NextRequest,
): Promise<{ state: NavigationState; refreshRequired: boolean }> {
  const session = await getSessionFromRequest(req);
  if (session)
    return {
      state: session.navigation
        ? stateFromClaim(session.navigation)
        : { kind: "GUEST", nextRoute: "/login", completed: false },
      refreshRequired: !session.navigation,
    };
  const draft = req.cookies.get("pudding_parent_signup")?.value;
  if (draft) {
    const key = getJwtSecretKey();
    try {
      const { payload } = await jwtVerify(draft, key, {
        algorithms: ["HS256"],
      });
      if (
        payload.purpose === "PARENT_SIGNUP" &&
        typeof payload.draftId === "string"
      ) {
        if (
          payload.navigationVersion === 1 &&
          SIGNUP_STEPS.includes(
            payload.nextRoute as (typeof SIGNUP_STEPS)[number],
          )
        )
          return {
            state: {
              kind: "DRAFT",
              nextRoute: payload.nextRoute as string,
              completed: false,
            },
            refreshRequired: false,
          };
        return {
          state: {
            kind: "GUEST",
            nextRoute: "/onboarding/email",
            completed: false,
          },
          refreshRequired: true,
        };
      }
    } catch {
      /* Invalid/expired draft signatures cannot grant account access. */
    }
  }
  return {
    state: { kind: "GUEST", nextRoute: "/onboarding/email", completed: false },
    refreshRequired: false,
  };
}
