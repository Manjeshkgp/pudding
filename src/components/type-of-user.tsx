"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import BottomSheet from "@/components/bottom-sheet";
import useStageScale from "@/components/use-stage-scale";
import wavingCat from "../../public/lottie/waving-cat.json";

const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), {
  ssr: false,
});

const IMG = "/images/type-of-user";

export default function TypeOfUser() {
  const reduceMotion = useReducedMotion();
  const scale = useStageScale();
  const router = useRouter();
  const [selected, setSelected] = useState<"parent" | "kid" | null>(null);

  // Tap a button: it turns black, then the next screen opens
  function choose(who: "parent" | "kid") {
    if (selected) return;
    setSelected(who);
    window.setTimeout(() => router.push(`/${who}`), 350);
  }

  const base =
    "flex h-[52px] flex-1 items-center justify-center rounded-full px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] transition-colors duration-200";
  const chosen = "bg-black text-white";
  const idle = "bg-[#e8e8e8] text-black";

  return (
    <main className="h-dvh overflow-hidden bg-[#ffeb69]">
      <div className="relative h-full w-full overflow-hidden bg-[#ffeb69]">
        {/* The 402 x 874 phone frame, pinned to the bottom and centered */}
        <div
          className="absolute bottom-0 left-1/2 h-[874px] w-[402px]"
          style={{
            transform: `translateX(-50%) scale(${scale})`,
            transformOrigin: "bottom center",
          }}
        >
          {/* Room: window, wall, floor, rug, shelf, piggy bank and coins */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${IMG}/scene.svg`}
            alt=""
            className="pointer-events-none absolute inset-0 h-[874px] w-[402px] max-w-none"
          />

          {/* Waving cat (shadow is part of the animation) */}
          <div
            className="pointer-events-none absolute left-[8.65px] top-[224px] size-[394px]"
            aria-hidden="true"
          >
            <Lottie
              src={wavingCat}
              loop
              autoplay={!reduceMotion}
              className="size-full"
            />
          </div>
        </div>
        <BottomSheet>
          <div className="flex w-full flex-col gap-5">
            <h1 className="font-display w-full text-[32px] font-bold leading-[40px] tracking-[-0.64px] text-black">
              Who&apos;s getting started today?
            </h1>
            <div className="flex w-full items-start gap-2">
              <button
                type="button"
                onClick={() => choose("parent")}
                aria-pressed={selected === "parent"}
                className={`${base} ${selected === "parent" ? chosen : idle}`}
              >
                Parent
              </button>
              <button
                type="button"
                onClick={() => choose("kid")}
                aria-pressed={selected === "kid"}
                className={`${base} ${
                  selected === "kid"
                    ? chosen
                    : `${idle} shadow-[inset_-2px_-4px_32px_0px_rgba(255,255,255,0.3)]`
                }`}
              >
                Child
              </button>
            </div>
          </div>
        </BottomSheet>
      </div>
    </main>
  );
}
