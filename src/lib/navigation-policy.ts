type DraftProgress = {
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
  notificationsCompletedAt: Date | null;
  securityQuestions: unknown;
};
export function draftNextRoute(draft: DraftProgress) {
  const count = Array.isArray(draft.securityQuestions)
    ? draft.securityQuestions.length
    : 0;
  if (!draft.emailVerifiedAt) return "/onboarding/verify";
  if (!draft.passwordHash) return "/onboarding/password";
  if (!draft.notificationsCompletedAt && !count)
    return "/onboarding/notifications";
  return count === 0
    ? "/onboarding/security"
    : count === 1
      ? "/onboarding/security-2"
      : "/onboarding/profile";
}
export type NavigationState = {
  kind: "GUEST" | "DRAFT" | "PARENT" | "CHILD" | "BLOCKED";
  nextRoute: string;
  completed: boolean;
  childrenStage?: boolean;
  childCount?: number;
};
const guestPages = new Set([
  "/",
  "/splash",
  "/start",
  "/parent",
  "/login",
  "/kid",
  "/kid/forgot",
  "/forgot-password",
]);
export const legacyOnboardingPages = new Set([
  "/setup",
  "/email",
  "/verify",
  "/password",
  "/notifications",
  "/security",
  "/security-2",
  "/profile",
  "/add-kid",
  "/crew",
  "/paypal",
  "/pin",
  "/plan",
  "/connecting",
  "/done",
]);
export function isParentPage(path: string) {
  return [
    "/family",
    "/account",
    "/children",
    "/approvals",
    "/approve",
    "/chores",
    "/allowances",
    "/activity",
    "/goals",
    "/coparent",
    "/topup",
    "/activate",
    "/support",
  ].some((p) => path === p || path.startsWith(p + "/"));
}
export function taskSubmissionPath(id: string) {
  return `/approvals/tasks/${encodeURIComponent(id)}`;
}

export function navigationRedirect(
  state: NavigationState,
  path: string,
): string | null {
  if (path === "/account-blocked")
    return state.kind === "BLOCKED"
      ? null
      : state.kind === "GUEST"
        ? "/start"
        : state.nextRoute;
  const onboarding = path === "/onboarding" || path.startsWith("/onboarding/");
  const legacy =
    legacyOnboardingPages.has(path) || /^\/crew\/[^/]+(?:\/edit)?$/.test(path);
  const guest = guestPages.has(path);
  const parent = isParentPage(path);
  const child = ["/home", "/earn", "/money", "/savings", "/quest", "/scan"]
    .includes(path);
  const shared =
    path === "/inbox" ||
    path === "/purchases" ||
    path.startsWith("/purchases/");
  if (!(onboarding || legacy || guest || parent || child || shared))
    return null;
  if (state.kind === "BLOCKED") return state.nextRoute;
  if (legacy) {
    if (state.kind === "PARENT" && state.completed) {
      if (path === "/profile") return "/account/profile";
      if (path === "/paypal") return "/account/paypal";
      if (path === "/pin") return "/account/security";
      if (path === "/add-kid") return "/children/new";
      const match = path.match(/^\/crew\/([^/]+)(?:\/edit)?$/);
      if (match) return `/children/${encodeURIComponent(match[1])}/edit`;
      if (path === "/crew") return "/children";
      return "/family";
    }
    if (state.kind === "GUEST")
      return path === "/setup"
        ? "/onboarding/setup"
        : "/api/auth/parent/signup/resume";
    return state.nextRoute;
  }
  if (onboarding) {
    if (state.kind === "CHILD" || (state.kind === "PARENT" && state.completed))
      return state.nextRoute;
    if (state.kind === "GUEST")
      return ["/onboarding/setup", "/onboarding/email"].includes(path)
        ? null
        : "/onboarding/email";
    if (
      state.kind === "DRAFT" &&
      state.nextRoute === "/onboarding/verify" &&
      path === "/onboarding/email"
    )
      return null;
    if (state.childrenStage || state.nextRoute === "/onboarding/plan") {
      if (path === "/onboarding/children")
        return state.childrenStage && !state.childCount ? state.nextRoute : null;
      if (path === "/onboarding/add-kid" || /^\/onboarding\/children\/[^/]+\/edit$/.test(path))
        return null;
    }
    return path === state.nextRoute ? null : state.nextRoute;
  }
  if (guest) {
    if (state.kind === "PARENT" || state.kind === "CHILD")
      return state.nextRoute;
    // A draft may leave signup to log in to an existing account; it cannot restart signup.
    if (
      state.kind === "DRAFT" &&
      !["/login", "/forgot-password", "/kid", "/kid/forgot"].includes(path)
    )
      return state.nextRoute;
    return null;
  }
  if (state.kind === "GUEST" || state.kind === "DRAFT")
    return child ? "/kid" : "/login";
  if (state.kind === "PARENT" && !state.completed) return state.nextRoute;
  // Task proof, activity and saving are shared views with their own API scoping.
  if (
    state.kind === "CHILD" &&
    parent &&
    !["/activity", "/goals"].some(
      (p) => path === p || path.startsWith(p + "/"),
    ) &&
    !/^\/chores\/[^/]+\/proof$/.test(path)
  )
    return "/home";
  if (state.kind === "PARENT" && child) return state.nextRoute;
  return null;
}
