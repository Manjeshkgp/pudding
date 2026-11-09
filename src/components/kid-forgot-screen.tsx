"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import CryingCatArt from "@/components/crying-cat-art";
import TopBar from "@/components/top-bar";

// Kid "forgot password". Kids can't reset on their own, a parent does it.
export default function KidForgotScreen() {
  const reduceMotion = useReducedMotion();
  return (
    <main className="relative flex min-h-dvh flex-col bg-white">
      <TopBar backHref="/kid" />

      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-[170px] pt-6">
        <CryingCatArt />
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 flex w-full max-w-[334px] flex-col gap-4 text-center"
        >
          <h1 className="font-display text-[32px] font-bold leading-10 tracking-[-0.64px] text-black">
            Sorry, password reset isn&apos;t available here.
          </h1>
          <p className="text-[17px] leading-[25px] tracking-[-0.17px] text-black">
            Ask your parent to change your password from their account.
          </p>
        </motion.div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-[402px] flex-col gap-2.5 px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
        <Link
          href="/kid"
          className="flex h-[52px] w-full items-center justify-center rounded-full bg-[#e8e8e8] px-5 text-[17px] font-medium tracking-[-0.17px] text-black"
        >
          Back to login
        </Link>
        <Link
          href="/login"
          className="flex h-[52px] w-full items-center justify-center rounded-full bg-black px-5 text-[17px] font-medium tracking-[-0.17px] text-white"
        >
          Parent login
        </Link>
      </div>
    </main>
  );
}
