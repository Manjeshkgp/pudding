"use client";
import { useEffect, useRef, useTransition } from "react";
import { bindBrowserPush } from "@/lib/web-push-client";
import { installNavigationHistory } from "@/lib/navigation-history";
import { usePathname, useRouter } from "next/navigation";

/** Normal pages are already guarded by signed server cookies; no initial client check. */
export default function AuthNavigationBoundary({
  children,
  subjectId,
}: {
  children: React.ReactNode;
  subjectId?: string;
}) {
  const path = usePathname();
  const router = useRouter();
  const [historyPending, startHistoryRefresh] = useTransition();
  const lastRefresh = useRef(0);
  useEffect(() => {
    // Next installs its own History API integration in a parent effect. Attach
    // afterward so our cleanup can restore it, including Strict Mode remounts.
    let cleanup: (() => void) | undefined;
    const timer = setTimeout(() => {
      cleanup = installNavigationHistory();
    }, 0);
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, []);
  const authForm =
    path.startsWith("/onboarding") ||
    [
      "/",
      "/start",
      "/parent",
      "/login",
      "/kid",
      "/setup",
      "/email",
      "/verify",
      "/password",
      "/security",
      "/security-2",
      "/profile",
      "/add-kid",
      "/crew",
      "/paypal",
      "/pin",
    ].includes(path);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = (history = false) => {
      if (timer) clearTimeout(timer);
      if (history) {
        lastRefresh.current = Date.now();
        startHistoryRefresh(() => router.refresh());
      } else {
        // Reconcile explicit auth changes without unmounting forms.
        timer = setTimeout(() => {
          if (Date.now() - lastRefresh.current < 1000) return;
          lastRefresh.current = Date.now();
          router.refresh();
        }, 100);
      }
    };
    const back = () => {
      const destination = window.location.pathname;
      // Next already restores normal pages on Back. Revalidate only cached
      // auth/onboarding forms, which must not reopen after completing signup.
      if (
        destination.startsWith("/onboarding") ||
        [
          "/",
          "/start",
          "/parent",
          "/login",
          "/kid",
          "/setup",
          "/email",
          "/verify",
          "/password",
          "/security",
          "/security-2",
          "/profile",
          "/add-kid",
          "/crew",
          "/paypal",
          "/pin",
        ].includes(destination)
      )
        refresh(true);
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted && authForm) refresh(true);
    };
    const authChanged = () => refresh();
    const visible = () => {
      // Signed-in pages validate current access through their data APIs.
      // Refreshing their router on focus can compete with the first link click.
      if (authForm && document.visibilityState === "visible") refresh();
    };
    const changed = (event: StorageEvent) => {
      if (event.key === "pudding-auth-changed") refresh();
    };
    const cancelScheduledRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    window.addEventListener("popstate", back);
    window.addEventListener("pageshow", restored);
    window.addEventListener("storage", changed);
    window.addEventListener("pudding-auth-changed", authChanged);
    document.addEventListener("visibilitychange", visible);
    // Let a user's navigation win over any queued refresh of the old route.
    document.addEventListener("click", cancelScheduledRefresh, true);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("popstate", back);
      window.removeEventListener("pageshow", restored);
      window.removeEventListener("storage", changed);
      window.removeEventListener("pudding-auth-changed", authChanged);
      document.removeEventListener("visibilitychange", visible);
      document.removeEventListener("click", cancelScheduledRefresh, true);
    };
  }, [router, path, authForm]);
  useEffect(() => {
    if (
      subjectId &&
      "Notification" in window &&
      Notification.permission === "granted"
    )
      void bindBrowserPush(subjectId);
  }, [subjectId]);
  return (
    <>
      <div hidden={historyPending && authForm}>{children}</div>
      {historyPending && authForm && (
        <main
          aria-busy="true"
          aria-label="Restoring your page"
          className="min-h-dvh bg-white"
        />
      )}
    </>
  );
}
