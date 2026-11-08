"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), {
  ssr: false,
});

// Completion screen. The cat Lottie goes at /public/lottie/completion-cat.json.
export default function DoneScreen() {
  const reduceMotion = useReducedMotion();
  return (
    <main className="relative flex min-h-dvh flex-col bg-white">
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-[140px] pt-10">
        <div className="size-[300px] shrink-0" aria-hidden>
          <Lottie
            src="/lottie/completion-cat.json"
            loop
            autoplay={!reduceMotion}
            className="size-full"
          />
        </div>
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex w-full max-w-[335px] flex-col gap-4 text-center"
        >
          <h1 className="font-display text-[32px] font-bold leading-10 tracking-[-0.64px] text-black">
            You&apos;re all set.
            <br />
            Let the fun begin!
          </h1>
          <p className="text-[17px] leading-[25px] tracking-[-0.17px] text-black">
            Everything is in place. Your little one is ready for their money adventure.
          </p>
        </motion.div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[402px] px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
        <div className="rounded-3xl bg-[#f3f3f3]">
          <Link
            href="/"
            className="flex h-[52px] w-full items-center justify-center rounded-full bg-black px-5 text-[17px] font-medium tracking-[-0.17px] text-white"
          >
            Bring it on!
          </Link>
        </div>
      </div>
    </main>
  );
}
