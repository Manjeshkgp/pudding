"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getApi } from "@/lib/client-api";
import { isParentPage } from "@/lib/navigation-policy";
import { purchaseReviewPath } from "@/lib/purchase-review";

export default function ParentApprovalQueue() {
  const path = usePathname();
  const router = useRouter();
  const shown = useRef<string | null>(null);

  useEffect(() => {
    const review = /^\/approve\/([^/]+)$/.exec(path);
    if (review) {
      shown.current = review[1];
      return;
    }
    const eligible = isParentPage(path) || path === "/inbox" || path.startsWith("/purchases/");
    // Let a parent finish setting up their PIN or wallet, or add funds to
    // resolve the current request.
    if (!eligible || /^\/(approve|topup|account\/(security|paypal))(\/|$)/.test(path))
      return;

    let active = true;
    let checking = false;
    async function check() {
      if (!active || checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const { next } = await getApi<{ next: { id: string; status: string } | null }>(
          "/api/purchases/approval-queue",
        );
        if (!active || window.location.pathname !== path || document.visibilityState !== "visible") return;
        if (!next) shown.current = null;
        else if (next.status !== "PROCESSING" && shown.current !== next.id) {
          shown.current = next.id;
          router.push(purchaseReviewPath(next.id));
        }
      } catch {
        // The next poll or focus event can retry a failed read.
      } finally {
        checking = false;
      }
    }
    const onPush = (event: MessageEvent) => {
      if (event.data?.type === "pudding-purchase-approval") void check();
    };
    const timer = window.setInterval(check, 12000);
    window.addEventListener("focus", check);
    window.addEventListener("pudding-data-changed", check);
    document.addEventListener("visibilitychange", check);
    navigator.serviceWorker?.addEventListener("message", onPush);
    void check();
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("pudding-data-changed", check);
      document.removeEventListener("visibilitychange", check);
      navigator.serviceWorker?.removeEventListener("message", onPush);
    };
  }, [path, router]);

  return null;
}
