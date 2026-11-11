import type { NavigationState } from "@/lib/navigation-policy";
export type SessionNavigationClaim = {
  version: 1;
  status: "CHILDREN" | "PAYPAL" | "PIN" | "COMPLETED" | "CHILD" | "BLOCKED";
  childCount?: number;
};
export function claimFromState(state: NavigationState): SessionNavigationClaim {
  if (state.kind === "BLOCKED") return { version: 1, status: "BLOCKED" };
  if (state.kind === "CHILD") return { version: 1, status: "CHILD" };
  if (state.kind !== "PARENT")
    throw new Error(
      "Cannot issue an authenticated session for a missing account.",
    );
  if (state.completed) return { version: 1, status: "COMPLETED" };
  if (state.childrenStage)
    return {
      version: 1,
      status: "CHILDREN",
      childCount: state.childCount || 0,
    };
  return {
    version: 1,
    status: state.nextRoute === "/onboarding/paypal" ? "PAYPAL" : "PIN",
  };
}
export function parseNavigationClaim(
  value: unknown,
  subject: "USER" | "CHILD",
): SessionNavigationClaim | undefined {
  if (!value || typeof value !== "object") return;
  const v = value as Partial<SessionNavigationClaim>;
  if (v.version !== 1) return;
  const allowed =
    subject === "CHILD"
      ? ["CHILD", "BLOCKED"]
      : ["CHILDREN", "PAYPAL", "PIN", "COMPLETED", "BLOCKED"];
  if (!v.status || !allowed.includes(v.status)) return;
  if (
    v.status === "CHILDREN" &&
    (!Number.isSafeInteger(v.childCount) || v.childCount! < 0)
  )
    return;
  return {
    version: 1,
    status: v.status,
    ...(v.status === "CHILDREN" ? { childCount: v.childCount } : {}),
  };
}
export function stateFromClaim(claim: SessionNavigationClaim): NavigationState {
  switch (claim.status) {
    case "BLOCKED":
      return {
        kind: "BLOCKED",
        nextRoute: "/account-blocked",
        completed: false,
      };
    case "CHILD":
      return { kind: "CHILD", nextRoute: "/home", completed: true };
    case "COMPLETED":
      return { kind: "PARENT", nextRoute: "/family", completed: true };
    case "CHILDREN":
      return {
        kind: "PARENT",
        nextRoute: claim.childCount
          ? "/onboarding/children"
          : "/onboarding/add-kid",
        completed: false,
        childrenStage: true,
        childCount: claim.childCount || 0,
      };
    case "PAYPAL":
      return {
        kind: "PARENT",
        nextRoute: "/onboarding/paypal",
        completed: false,
      };
    case "PIN":
      return { kind: "PARENT", nextRoute: "/onboarding/pin", completed: false };
  }
}
