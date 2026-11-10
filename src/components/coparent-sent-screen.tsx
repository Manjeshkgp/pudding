"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { CloseIcon } from "@/components/icons";
import { PrimaryButton, readInvites } from "@/components/coparent-parts";

// Parent flow: the invite has been "sent" (sample only, nothing leaves the browser).
export default function CoparentSentScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("parent@gmail.com");
  useEffect(() => {
    const last = readInvites().at(-1);
    if (last) setEmail(last.email);
  }, []);

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col pt-[max(16px,env(safe-area-inset-top))]">
        <div className="px-4">
          <button
            type="button"
            aria-label="Close"
            onClick={() => router.push("/coparent")}
            className="flex size-11 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
          >
            <CloseIcon className="size-6" />
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-32 text-center">
          {/* Badge pops in: 80% -> 103.5% -> 100% while fading in (Figma motion) */}
          <motion.div
            className="relative size-[88px]"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [0.8, 1.035, 1], opacity: [0, 1, 1] }}
            transition={{ duration: 0.5, delay: 0.1, times: [0, 0.6, 1], ease: "easeOut" }}
          >
            <svg viewBox="0 0 88 88" className="size-full" aria-hidden="true">
              <defs>
                <linearGradient id="sent-green" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#168f4f" />
                  <stop offset="1" stopColor="#0f7a42" />
                </linearGradient>
              </defs>
              <circle cx="44" cy="44" r="44" fill="url(#sent-green)" />
              <path
                d="M29 45l10.5 10.5L60 34"
                fill="none"
                stroke="#fff"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.div>
          <motion.h1
            className="mt-6 font-display text-[32px] font-bold leading-10 tracking-[-0.64px] text-[#17261f]"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.35 }}
          >
            Invite sent
          </motion.h1>
          <motion.p
            className="mt-2 max-w-[320px] break-words text-[15px] leading-[22px] tracking-[-0.15px] text-black"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.45 }}
          >
            We have sent an invite to {email}.
            <br />
            This link will expire in 7 days
          </motion.p>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[520px] px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
        <PrimaryButton onClick={() => router.push("/coparent")}>Done</PrimaryButton>
      </div>
    </main>
  );
}
