"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), {
  ssr: false,
});

// PayPal connection motion exported from Figma (402 x 874, 5.4 s).
// Plays once and stays on "PayPal connected successfully". Sample only: nothing is connected.
export default function ConnectingScreen() {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const timer = useRef<number | undefined>(undefined);

  // Go to the completion screen 1 second after the animation ends.
  const goNext = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => router.push("/done"), 1000);
  };

  useEffect(() => {
    // Fallback if the animation never reports completion (e.g. reduced motion).
    timer.current = window.setTimeout(() => router.push("/done"), 5400 + 1000 + 1000);
    return () => window.clearTimeout(timer.current);
  }, [router]);
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
