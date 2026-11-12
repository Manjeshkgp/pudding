"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Button } from "@/components/app-ui";
import { CheckmarkIcon } from "@/components/icons";

const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), {
  ssr: false,
});

export default function PayPalSuccessScreen({
  title,
  description,
  animation = "coin-to-tick",
  label,
  busy = false,
  onContinue,
}: {
  title: string;
  description: string;
  animation?: "coin-to-tick" | "paypal-connection";
  label: string;
  busy?: boolean;
  onContinue: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [animationFailed, setAnimationFailed] = useState(false);
  const showMotion = reduceMotion === false && !animationFailed;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col bg-white px-5 pb-[max(32px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))]">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6 text-center">
        {showMotion ? (
          <div
            aria-hidden="true"
            className={animation === "paypal-connection"
              ? "aspect-[402/874] h-[min(50dvh,420px)] shrink-0"
              : "size-48 shrink-0"}
          >
            <Lottie
              src={`/lottie/${animation}.json`}
              loop={false}
              autoplay
              subscriptions={{ error: () => setAnimationFailed(true) }}
              className="size-full"
            />
          </div>
        ) : (
          <div className="grid size-36 place-items-center rounded-full bg-[#eaf6ed] text-[#0e8345]" aria-hidden="true">
            <CheckmarkIcon className="size-16" />
          </div>
        )}
        <div role="status" className="flex max-w-sm flex-col gap-3">
          <h1 className="font-display text-[32px] font-bold leading-10">{title}</h1>
          <p className="text-[17px] leading-6 text-[#5e5e5e]">{description}</p>
        </div>
      </div>
      <Button busy={busy} onClick={onContinue}>{label}</Button>
    </main>
  );
}
