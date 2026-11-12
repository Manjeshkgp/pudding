"use client";

import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";

const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), {
  ssr: false,
});

// Sad cat for the kid forgot-password screen (reuses the crying cat Lottie).
export default function CryingCatArt() {
  const reduceMotion = useReducedMotion();
  return (
    <div className="size-[298px] shrink-0" aria-hidden>
      <Lottie
        src="/lottie/crying-cat.json"
        loop
        autoplay={!reduceMotion}
        className="size-full"
      />
    </div>
  );
}
