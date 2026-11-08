"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { AVATARS } from "@/components/avatar-sheet";
import PaypalMark from "@/components/paypal-mark";

// Connect PayPal, shown after "Start 30-days free trail". Sample data only: nothing is connected.
function UserFilled() {
  return (
    <svg viewBox="0 0 28 28" className="size-7" aria-hidden="true">
      <circle cx="14" cy="8.5" r="5.5" fill="currentColor" />
      <path d="M3.5 25c0-5.5 4.7-9 10.5-9s10.5 3.5 10.5 9z" fill="currentColor" />
    </svg>
  );
}
function EyeScan() {
  return (
    <svg viewBox="0 0 28 28" className="size-7" aria-hidden="true">
      <path
        d="M3 9V5.5A2.5 2.5 0 0 1 5.5 3H9M19 3h3.5A2.5 2.5 0 0 1 25 5.5V9M25 19v3.5a2.5 2.5 0 0 1-2.5 2.5H19M9 25H5.5A2.5 2.5 0 0 1 3 22.5V19"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path d="M4.5 14C7 9.8 10.3 8 14 8s7 1.8 9.5 6c-2.5 4.2-5.8 6-9.5 6s-7-1.8-9.5-6z" fill="currentColor" />
      <circle cx="14" cy="14" r="2.8" fill="#eff4fe" />
    </svg>
  );
}
function DollarCircle() {
  return (
    <svg viewBox="0 0 28 28" className="size-7" aria-hidden="true">
      <circle cx="14" cy="14" r="11.5" fill="currentColor" />
      <path
        d="M17.5 10.3c-.4-1.3-1.8-2.1-3.5-2.1-2 0-3.4 1-3.4 2.5 0 3.6 7 1.8 7 5.5 0 1.6-1.5 2.7-3.6 2.7-1.8 0-3.3-.9-3.7-2.3M14 6.5v15"
        fill="none"
        stroke="#eff4fe"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

const STEPS = [
  { Icon: UserFilled, text: "Sign in to your PayPal account." },
  { Icon: EyeScan, text: "Review the payment permissions." },
  { Icon: DollarCircle, text: "Allow payments through your PayPal account." },
];

export default function PaypalScreen() {
  const [me, setMe] = useState(0);

  useEffect(() => {
    try {
      const i = Number(sessionStorage.getItem("pudding-avatar"));
      if (Number.isInteger(i) && AVATARS[i]) setMe(i);
    } catch {}
  }, []);

  return (
    <main className="min-h-dvh bg-white">
      <div className="px-4 pt-[max(20px,env(safe-area-inset-top))]">
        <div className="flex h-11 items-center justify-between">
          <Link
            href="/plan"
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

        <div className="flex flex-col gap-2 pb-8 pt-6">
          <div className="relative h-[76px] w-full">
            <span className="absolute left-0 top-0 size-16 overflow-hidden rounded-full bg-[#ffd7ef]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/profile/avatar-2.svg" alt="" className="size-full" />
            </span>
            <PaypalMark className="absolute left-[43.43px] top-0 size-16" />
          </div>
          <h1 className="font-display text-[32px] font-bold leading-[40px] tracking-[-0.64px] text-black">
            Connect your PayPal
          </h1>
          <p className="text-[17px] leading-[25px] tracking-[-0.17px] text-black">
            Your PayPal will be used to funds your child’s payments and subscriptions billing.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-7 pb-[140px]">
        <h2 className="px-4 text-xl font-semibold leading-7 tracking-[-0.15px] text-black">
          Set up your PayPal connection in 3 easy steps
        </h2>
        <ul className="flex flex-col gap-5">
          {STEPS.map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-4 px-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#eff4fe] text-black">
                <Icon />
              </span>
              <span className="min-w-0 flex-1 text-[17px] leading-[25px] tracking-[-0.17px] text-black">
                {text}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
        <div className="rounded-3xl bg-[#f3f3f3]">
          <Link
            href="/connecting"
            className="flex h-[52px] w-full items-center justify-center rounded-full bg-black px-5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-white"
          >
            Connect
          </Link>
        </div>
      </div>
    </main>
  );
}
