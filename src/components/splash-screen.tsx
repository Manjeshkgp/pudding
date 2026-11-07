"use client";

import { useEffect } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";

// Cat size follows the screen: full size (347 x 352) when there is room,
// smaller on short screens so it never reaches the text.
const stage = {
  "--cat-h": "min(352px, 40dvh, 92vw)",
  "--cat-w": "calc(var(--cat-h) * 347 / 352)",
} as CSSProperties;

export default function SplashScreen() {
  const reduceMotion = useReducedMotion();
  const router = useRouter();

  // After the cat has arrived and settled, move on to "Who's getting started today?"
  useEffect(() => {
    const timer = window.setTimeout(() => router.replace("/start"), 2800);
    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <main className="h-dvh overflow-hidden bg-[#ffd7ef]">
      <div
        style={stage}
        className="relative h-full w-full overflow-hidden bg-[#ffd7ef]"
      >
        {/* Wordmark and tagline sit just above the cat */}
        <div className="absolute bottom-[calc(var(--cat-h)+min(54px,6dvh))] left-1/2 flex w-[293px] -translate-x-1/2 flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/pudding-wordmark.svg"
            alt="Pudding"
            width={204.828}
            height={50}
            className="block h-[50px] w-[204.828px] max-w-none"
          />
          <p className="w-full text-center font-sans text-[20px] leading-[25px] tracking-[-0.2px] text-black">
            Your kiddo’s no.1 finance partner
          </p>
        </div>

        {/* Cat comes in from the left edge in one move and stops in the corner */}
        <motion.div
          className="pointer-events-none absolute bottom-0 left-0 h-[var(--cat-h)] w-[var(--cat-w)]"
          initial={reduceMotion ? false : { x: "-100%" }}
          animate={{ x: 0 }}
          transition={{ delay: 0.4, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/pudding-cat.svg"
            alt=""
            className="block size-full max-w-none"
          />
        </motion.div>
      </div>
    </main>
  );
}
