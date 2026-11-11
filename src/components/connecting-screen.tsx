"use client";

import { getApi } from "@/lib/client-api";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), {
  ssr: false,
});

// PayPal connection motion exported from Figma (402 x 874, 5.4 s).
// Shows confirmation only after the API verifies a saved wallet.
export default function ConnectingScreen() {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const [verified, setVerified] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    getApi<{ user?: { paypalVaultConnected: boolean } }>("/api/auth/me")
      .then((r) => {
        if (!r.user?.paypalVaultConnected) router.replace("/paypal");
        else setVerified(true);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  // Go to the completion screen 1 second after the animation ends.
  const goNext = () => {
    if (!verified) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => router.push("/pin"), 1000);
  };

  useEffect(() => {
    if (!verified) return;
    // Fallback if the animation never reports completion (e.g. reduced motion).
    timer.current = window.setTimeout(
      () => router.push("/pin"),
      5400 + 1000 + 1000,
    );
    return () => window.clearTimeout(timer.current);
  }, [router, verified]);
  if (!verified)
    return (
      <main className="p-6" role="status">
        Checking your PayPal connection…
      </main>
    );
  return (
    <main className="relative h-dvh overflow-hidden bg-white">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[874px] w-[402px] -translate-x-1/2 -translate-y-1/2"
        role="status"
        aria-label="Connecting to your PayPal account"
      >
        <Lottie
          src="/lottie/paypal-connection.json"
          loop={false}
          subscriptions={{ complete: goNext }}
          autoplay={!reduceMotion}
          className="size-full"
        />
      </div>
    </main>
  );
}
