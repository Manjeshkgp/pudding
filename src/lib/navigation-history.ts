// Browser-entry metadata is for navigation UX only, never authentication.
type Entry = { depth: number; url: string; previous: string | null };
const KEY = "__puddingNavigation";
function localUrl(value: string | URL | null | undefined) {
  const url = new URL(
    value?.toString() || window.location.href,
    window.location.href,
  );
  return url.origin === window.location.origin
    ? url.pathname + url.search + url.hash
    : null;
}
export function installNavigationHistory() {
  const originalPush = window.history.pushState;
  const originalReplace = window.history.replaceState;
  const push = originalPush.bind(window.history);
  const replace = originalReplace.bind(window.history);
  const initial = window.history.state?.[KEY] as Entry | undefined;
  if (!initial || initial.url !== localUrl(window.location.href))
    replace(
      {
        ...window.history.state,
        [KEY]: {
          depth: 0,
          url: localUrl(window.location.href),
          previous: null,
        },
      },
      "",
    );
  const trackedPush: History["pushState"] = (data, unused, url) => {
    const current = window.history.state?.[KEY] as Entry | undefined;
    const destination = localUrl(url);
    push(
      {
        ...data,
        [KEY]: {
          depth: destination ? (current?.depth || 0) + 1 : 0,
          url: destination,
          previous: current?.url || null,
        },
      },
      unused,
      url,
    );
  };
  const trackedReplace: History["replaceState"] = (data, unused, url) => {
    const current = window.history.state?.[KEY] as Entry | undefined;
    replace(
      {
        ...data,
        [KEY]: {
          depth: current?.depth || 0,
          url: localUrl(url),
          previous: current?.previous || null,
        },
      },
      unused,
      url,
    );
  };
  window.history.pushState = trackedPush;
  window.history.replaceState = trackedReplace;
  // Balance setup/cleanup during Strict Mode, Fast Refresh and unmounts.
  return () => {
    if (window.history.pushState === trackedPush)
      window.history.pushState = originalPush;
    if (window.history.replaceState === trackedReplace)
      window.history.replaceState = originalReplace;
  };
}
const guestRoutes = new Set([
  "/",
  "/start",
  "/splash",
  "/parent",
  "/login",
  "/kid",
  "/forgot-password",
  "/setup",
  "/email",
  "/verify",
  "/password",
  "/profile",
  "/security",
  "/security-2",
]);
function authRoute(path: string) {
  return guestRoutes.has(path) || path.startsWith("/onboarding");
}
export function canGoBack(avoid: string[] = []) {
  const entry = window.history.state?.[KEY] as Entry | undefined;
  if (
    !entry ||
    entry.depth <= 0 ||
    !entry.previous ||
    entry.previous === entry.url
  )
    return false;
  const previous = new URL(entry.previous, window.location.origin);
  const current = window.location.pathname;
  if (
    previous.origin !== window.location.origin ||
    previous.pathname.startsWith("/api/")
  )
    return false;
  if (!authRoute(current) && authRoute(previous.pathname)) return false;
  if (avoid.includes(previous.pathname)) return false;
  if (
    (current === "/onboarding/add-kid" ||
      current.startsWith("/onboarding/children")) &&
    previous.pathname !== "/onboarding/add-kid" &&
    !previous.pathname.startsWith("/onboarding/children")
  )
    return false;
  if (
    current === "/coparent" &&
    ["/coparent/add", "/coparent/invite", "/coparent/sent"].includes(
      previous.pathname,
    )
  )
    return false;
  // Never re-open completed invitation forms or bounce between add and invite.
  if (
    current === "/coparent/add" &&
    ["/coparent/invite", "/coparent/sent"].includes(previous.pathname)
  )
    return false;
  if (
    current === "/coparent/sent" &&
    ["/coparent/add", "/coparent/invite"].includes(previous.pathname)
  )
    return false;
  return true;
}
