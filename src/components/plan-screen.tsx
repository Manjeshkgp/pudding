"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { CheckmarkIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { AVATARS } from "@/components/avatar-sheet";

const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), {
  ssr: false,
});

// Plan screen after the crew list. Prices are sample data; nothing is charged.
const PLANS = [
  { id: "yearly", name: "Yearly plan", sub: "$36.67/yr", price: "$3.14", tag: "Most  popular" },
  { id: "monthly", name: "Monthly plan", sub: "$40.98/yr", price: "$4.16", tag: null },
] as const;

const GET = [
  {
    title: "Earn",
    items: [
      "Smart money app that grows with your kid.",
      "Gift money from family & friends.",
      "Instant transfers",
      "Pocket money & chore lists",
    ],
  },
  { title: "Spend", items: ["Parental app controls.", "Custom goals"] },
];

export default function PlanScreen() {
  const [plan, setPlan] = useState<"yearly" | "monthly">("yearly");
  const [me, setMe] = useState(0);
  const reduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 330);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    try {
      const i = Number(sessionStorage.getItem("pudding-avatar"));
      if (Number.isInteger(i) && AVATARS[i]) setMe(i);
    } catch {}
  }, []);

  return (
    <main className="min-h-dvh bg-white">
      {/* Top bar stays on screen; it turns white once the sky has scrolled away */}
      <div
        className={`fixed inset-x-0 top-0 z-20 px-4 pb-3 pt-[max(20px,env(safe-area-inset-top))] transition-colors duration-200 ${
          scrolled ? "bg-white" : "bg-transparent"
        }`}
      >
        <div className="flex h-11 items-center justify-between">
          <Link
            href="/crew"
            aria-label="Back"
            className="flex size-11 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
          >
            <ChevronLeftIcon className="size-6 text-black" />
          </Link>
          <Link
            href="/account"
            aria-label="Account"
            className="size-11 overflow-hidden rounded-full"
            style={{ backgroundColor: AVATARS[me].bg }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={AVATARS[me].src} alt="" className="size-full" />
          </Link>
        </div>
      </div>

      {/* Sky, sun and clouds from Figma, with the flying cat on top. The stage is the 402 px phone frame, centered. */}
      <div className="relative h-[420px] w-full overflow-hidden bg-[linear-gradient(#ffd7ef_0,#ffd7ef_255px,#fff_255px)]">
        <div className="absolute left-1/2 top-0 h-full w-[402px] -translate-x-1/2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/plan/bg.svg"
            alt=""
            className="pointer-events-none absolute -left-1 -top-[1.35px] h-[385px] w-[410px] max-w-none"
          />
          <div
            className="pointer-events-none absolute left-[77.57px] top-[170.82px] size-[249px]"
            aria-hidden="true"
          >
            <Lottie
              src="/lottie/plan-cat.json"
              loop
              autoplay={!reduceMotion}
              className="size-full"
            />
          </div>
        </div>
      </div>

      <div className="relative -mt-[22px] flex flex-col gap-10 px-4 pb-[170px]">
        <div className="flex flex-col gap-10">
          <div className="flex flex-col items-center gap-6">
            <div className="flex h-6 items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/pudding-wordmark.svg" alt="Pudding" className="h-5 w-auto" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/plan/plus.svg" alt="Plus" className="h-6 w-[41px]" />
            </div>
            <h1 className="text-center font-display text-4xl font-bold leading-[44px] tracking-[-0.54px] text-black">
              Manage and teach your kid finance
            </h1>
          </div>

          <div role="radiogroup" aria-label="Plan" className="flex flex-col gap-5">
            {PLANS.map((p) => {
              const on = plan === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPlan(p.id)}
                  className={`relative flex w-full items-start justify-between rounded-[20px] border-2 text-left transition-colors ${
                    p.tag ? "pb-5 pl-5 pr-5 pt-8" : "p-5"
                  } ${
                    on
                      ? "border-[#0e8345] bg-[#eaf6ed]"
                      : "border-[#a6a6a6] bg-white"
                  }`}
                >
                  {p.tag && (
                    <span className="absolute -top-0.5 left-[19px] whitespace-pre rounded-b-xl bg-[#0e8345] px-2.5 py-1.5 text-[13px] font-medium leading-[15px] tracking-[-0.13px] text-white">
                      {p.tag}
                    </span>
                  )}
                  <span className="flex w-[151px] flex-col">
                    <span className="font-display text-xl font-bold leading-7 tracking-[-0.3px] text-black">
                      {p.name}
                    </span>
                    <span className="text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-[#5e5e5e]">
                      {p.sub}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <span className="font-display text-xl font-bold leading-7 tracking-[-0.3px] text-black">
                      {p.price}
                    </span>
                    <span className="text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-[#5e5e5e]">
                      /mon
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-[19px]">
          <h2 className="font-display text-2xl font-bold leading-8 tracking-[-0.48px] text-black">
            What you get
          </h2>
          {GET.map((g) => (
            <section key={g.title} className="flex flex-col gap-4 rounded-[20px] bg-[#eff4fe] p-5">
              <h3 className="text-xl font-semibold leading-7 tracking-[-0.15px] text-black">
                {g.title}
              </h3>
              <ul className="flex flex-col gap-3">
                {g.items.map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <span className="flex h-[25px] w-6 shrink-0 items-center justify-center">
                      <CheckmarkIcon className="size-6 text-[#0e8345]" />
                    </span>
                    <span className="min-w-0 flex-1 text-[17px] leading-[25px] tracking-[-0.17px] text-black">
                      {t}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex items-center justify-center gap-4 text-[13px] leading-[18px] tracking-[-0.13px] text-black underline">
          <Link href="/legal/terms">Terms of Use</Link>
          <Link href="/legal/privacy">Privacy Policy</Link>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 px-2 pb-[max(32px,env(safe-area-inset-bottom))] pt-4">
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-[#f3f3f3] px-2 py-3">
          <p className="text-[13px] leading-[18px] tracking-[-0.13px] text-[#a6a6a6]">
            Secure payment. Cancel anytime
          </p>
          <Link
            href="/paypal"
            className="relative flex h-[52px] w-full items-center justify-center rounded-full bg-black px-5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-white"
          >
            Start 30-days free trail
            <ChevronRightIcon className="absolute right-5 top-1/2 size-6 -translate-y-1/2 text-white" />
          </Link>
        </div>
      </div>
    </main>
  );
}
