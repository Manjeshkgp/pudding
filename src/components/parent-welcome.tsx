"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import BottomSheet from "@/components/bottom-sheet";
import useStageScale from "@/components/use-stage-scale";
import TopBar from "@/components/top-bar";
import { ChevronRightIcon } from "@/components/icons";

const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), {
  ssr: false,
});

const SCENE = "/images/parent/scene.png";
const CAT = "/lottie/parent-cat.json";

export default function ParentWelcome() {
  const reduceMotion = useReducedMotion();
  const scale = useStageScale();

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
            src={SCENE}
            alt=""
            className="pointer-events-none absolute left-1/2 top-0 h-[874px] w-[659px] max-w-none -translate-x-1/2"
          />

          {/* Cheering cat with its shadow */}
          <div
            className="pointer-events-none absolute left-[55px] top-[160.69px] size-[300.31px]"
            aria-hidden="true"
          >
            <Lottie
              src={CAT}
              loop
              autoplay={!reduceMotion}
              className="size-full"
            />
          </div>
        </div>

        <div className="absolute inset-x-0 top-0">
          <TopBar backHref="/start" />
        </div>

        <BottomSheet>
          <h1 className="font-display w-full text-center text-[44px] font-bold leading-[52px] tracking-[-0.66px] text-black">
            Let’s raise money-smart kids.
          </h1>
          <div className="mt-6 flex w-full flex-col gap-3">
            <Link
              href="/setup"
              className="relative flex h-[52px] w-full items-center justify-center rounded-full bg-black px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-white"
            >
              Get started
              <ChevronRightIcon className="absolute right-5 top-1/2 size-6 -translate-y-1/2 text-white" />
            </Link>
            <button
              type="button"
              className="flex h-[52px] w-full items-center justify-center rounded-full bg-[#e8e8e8] px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black shadow-[inset_-2px_-4px_32px_0px_rgba(255,255,255,0.3)]"
            >
              I already have an account
            </button>
          </div>
        </BottomSheet>
      </div>
    </main>
  );
}
