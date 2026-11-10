"use client";

import Link from "next/link";
import { useState } from "react";
import { CardIcon, ChevronRightIcon, RefreshIcon, SlidersIcon } from "@/components/icons";
import { AVATARS } from "@/components/avatar-sheet";

// Parent home. Sample data only, nothing is loaded or sent.

const TABS = ["Parents wallet", "Alex Silvestri", "Elena Silvestri"];

const KIDS = [
  { name: "Alex Silvestri", banner: "blue" },
  { name: "Elena Silvestri", banner: "black" },
];

function BankIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2.5L2.5 8V10H21.5V8L12 2.5ZM12 4.8L17.6 8H6.4L12 4.8Z" fill="currentColor" />
      <path d="M5 11.5H7V17H5V11.5ZM11 11.5H13V17H11V11.5ZM17 11.5H19V17H17V11.5Z" fill="currentColor" />
      <path d="M2.5 18.5H21.5V21H2.5V18.5Z" fill="currentColor" />
    </svg>
  );
}

// Filled question circle used in the activation banner
function HelpIcon({ className, mark, dot }: { className?: string; mark: string; dot: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill={dot} />
      <path
        d="M8 10C8 7.79086 9.79086 6 12 6C14.2091 6 16 7.79086 16 10C16 11.8638 14.7252 13.4299 13 13.874V14.5125H11V12H12C13.1046 12 14 11.1046 14 10C14 8.89543 13.1046 8 12 8C10.8954 8 10 8.89543 10 10H8Z"
        fill={mark}
      />
      <path d="M13 18V16H11V18H13Z" fill={mark} />
    </svg>
  );
}

const ROWS = [
  { label: "Wallet", action: "Activate", primary: true, Icon: CardIcon },
  { label: "Savings", action: "Set up", primary: false, Icon: BankIcon },
  { label: "Allowance", action: "Set up", primary: false, Icon: RefreshIcon },
];

export default function ParentHome() {
  const [tab, setTab] = useState(0);

  return (
    <main className="min-h-dvh bg-[#f1f7fa]">
      <div className="mx-auto w-full max-w-[520px] pb-[140px] pt-[max(16px,env(safe-area-inset-top))]">
        {/* Header */}
        <div className="flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href="/account"
            aria-label="Account"
            className="size-11 shrink-0 overflow-hidden rounded-full"
            style={{ backgroundColor: AVATARS[0].bg }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={AVATARS[0].src} alt="" className="size-full" />
          </Link>
          {TABS.map((t, i) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(i)}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-3 text-[15px] font-medium leading-[19px] tracking-[-0.15px] transition-colors ${
                tab === i ? "bg-black text-white" : "bg-white text-black"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1 px-4 py-7">
          <p className="text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-[#5e5e5e]">
            Parent wallet
          </p>
          <p className="font-display text-[52px] font-bold leading-[64px] tracking-[-0.78px] text-black">
            $0.00
          </p>
          <Link
            href="/topup"
            className="flex items-start gap-1 self-start text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-black"
          >
            Top your wallet now
            <ChevronRightIcon className="size-5" />
          </Link>
        </div>

        {/* Kid cards */}
        <div className="flex flex-col gap-3 p-2">
          {KIDS.map((k) => (
            <section key={k.name} className="overflow-clip rounded-[32px]">
              <div className="flex flex-col gap-3 bg-white py-6">
                <div className="flex items-center gap-3 px-5">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-full bg-[#ffeb69]">
                    <div className="absolute left-[calc(50%-2.37px)] top-[calc(50%+8.17px)] flex size-[68.748px] -translate-x-1/2 -translate-y-1/2 items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={AVATARS[0].src}
                        alt=""
                        className="size-[55.581px] max-w-none rotate-[16deg]"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col justify-center gap-1">
                    <p className="font-display text-[20px] font-bold leading-7 tracking-[-0.4px] text-black">
                      {k.name}
                    </p>
                    <button
                      type="button"
                      className="flex items-center gap-2 text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-[#a6a6a6]"
                    >
                      <SlidersIcon className="size-5" />
                      Manage
                    </button>
                  </div>
                </div>

                <div className="flex flex-col">
                  {ROWS.map((r, i) => (
                    <div
                      key={r.label}
                      className={`flex items-center justify-between px-5 ${
                        i === 0
                          ? "border-y border-[#e8e8e8] p-5"
                          : i < ROWS.length - 1
                            ? "border-b border-[#e8e8e8] p-5"
                            : "pt-5"
                      }`}
                    >
                      <div className="flex w-[111px] items-center gap-5">
                        <r.Icon className="size-6 shrink-0 text-black" />
                        <span className="text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black">
                          {r.label}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`rounded-full px-4 py-3 text-[15px] font-medium leading-[19px] tracking-[-0.15px] transition-opacity active:opacity-80 ${
                          r.primary ? "bg-black text-white" : "bg-[#f3f3f3] text-black"
                        }`}
                      >
                        {r.action}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className={`flex items-center gap-3 px-5 pb-6 pt-5 ${
                  k.banner === "blue" ? "bg-[#a0e1e1] text-black" : "bg-black text-white"
                }`}
              >
                <HelpIcon
                  className="size-6 shrink-0"
                  mark={k.banner === "blue" ? "#a0e1e1" : "#000"}
                  dot={k.banner === "blue" ? "#000" : "#fff"}
                />
                <p className="min-w-px flex-1 text-[15px] font-medium leading-[19px] tracking-[-0.15px]">
                  You need to activate the wallet to get login credentials for your child
                </p>
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Top up */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-2.5 pb-[max(48px,env(safe-area-inset-bottom))] pt-4">
        <Link
          href="/topup"
          className="pointer-events-auto flex items-center justify-center rounded-full border-[2.5px] border-transparent px-5 py-3 font-display text-[20px] font-bold leading-7 tracking-[-0.15px] text-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.2)] transition-transform active:scale-95"
          style={{
            background:
              "linear-gradient(#260a2f,#260a2f) padding-box, linear-gradient(135deg,#d9d9d9,#7a5a88 45%,#d9d9d9) border-box",
          }}
        >
          Top up
        </Link>
      </div>
    </main>
  );
}
