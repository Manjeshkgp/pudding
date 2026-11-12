"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import ParentHome from "@/components/parent-home";
import Keypad from "@/components/keypad";
import HelpLink from "@/components/help-link";
import PaypalMark from "@/components/paypal-mark";
import { AVATARS } from "@/components/avatar-sheet";
import { ChevronLeftIcon, CloseIcon, QuestionCircleFilledIcon, QuestionCircleIcon, SpinnerIcon, TickCircleIcon } from "@/components/icons";

// Purchase request flow for the parent. Sample data only, nothing is sent.
// Steps: the request pops up over the parent home, then the full request
// screen, then the PIN screen.

const KID = "Elena silvestry";
const MODAL_TOTAL = "$123";
const WARNING = "We have detected an adult product in this bill.";
const LIMIT_NOTE = "This payment is within limit of elena.";
const LIMIT_LEFT = "Elena’s available to spend- $124";
const AMOUNT = "$4.99";
const MERCHANT = "Pixel Quest";
const BALANCE = "$25.00";
const BILL = [
  { name: "Item 1(x2)", price: "$11.90", amount: "$11.90" },
  { name: "Item 1", price: "$11.90", amount: "$11.90", flagged: true },
  { name: "Item 3", price: "$11.90", amount: "$11.90" },
];
const BILL_TOTAL = "$11.90";

type Step = "modal" | "review" | "pin";

function KidChip({ size }: { size: "sm" | "md" }) {
  return (
    <span
      className={`flex items-center rounded-full bg-[#f3f3f3] px-3 py-2 ${size === "md" ? "gap-2.5" : "gap-2"}`}
    >
      <span className="relative size-8 shrink-0 overflow-hidden rounded-full bg-[#ffd7ef]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={AVATARS[0].src}
          alt=""
          className="absolute left-[-2.8px] top-[2.5px] size-7 max-w-none rotate-[16deg]"
        />
      </span>
      <span className="text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-black">
        {KID}
      </span>
    </span>
  );
}

function BlackButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-[52px] w-full items-center justify-center rounded-full bg-black px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-white transition-opacity active:opacity-80 disabled:bg-[#f3f3f3] disabled:text-[#a6a6a6]"
    >
      {children}
    </button>
  );
}

function SoftButton({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: "blue" | "red";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[52px] w-full items-center justify-center rounded-full px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] transition-opacity active:opacity-80 ${
        tone === "blue" ? "bg-[#eff4fe] text-[#276ef1]" : "bg-[#fff0ee] text-[#de1135]"
      }`}
    >
      {children}
    </button>
  );
}

function PageHeader({ title, onBack, color = "text-[#222]" }: { title: string; onBack: () => void; color?: string }) {
  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 bg-white px-4 pb-3 pt-[max(20px,env(safe-area-inset-top))]">
      <button
        type="button"
        aria-label="Back"
        onClick={onBack}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
      >
        <ChevronLeftIcon className="size-6" />
      </button>
      <h1 className={`min-w-px flex-1 py-2.5 font-display text-xl font-semibold leading-[22px] tracking-[-0.2px] ${color}`}>
        {title}
      </h1>
      <HelpLink
        aria-label="Help"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
      >
        <QuestionCircleIcon className="size-6" />
      </HelpLink>
    </div>
  );
}

export default function PurchaseRequest() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("modal");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  function confirm() {
    if (loading || pin.length < 6) return;
    setLoading(true);
    window.setTimeout(() => router.push("/family"), 1200);
  }

  // Keep the home screen behind the popup from scrolling
  useEffect(() => {
    if (step !== "modal") return;
    const html = document.documentElement;
    const body = document.body;
    const prev = [html.style.overflow, body.style.overflow];
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev[0];
      body.style.overflow = prev[1];
    };
  }, [step]);

  // Keyboard on a computer
  useEffect(() => {
    if (step !== "pin") return;
    function down(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || loading) return;
      if (/^[0-9]$/.test(e.key)) onKey(e.key);
      else if (e.key === "Backspace") onKey("back");
      else if (e.key === "Enter") confirm();
    }
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  });

  function onKey(k: string) {
    if (k === "back") setPin((p) => p.slice(0, -1));
    else if (k !== "." && pin.length < 6) setPin((p) => p + k);
  }

  if (step === "modal") {
    return (
      <>
        <ParentHome />
        <div className="fixed inset-0 z-50 touch-none overscroll-none bg-black/60">
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[520px] px-2 pb-[max(8px,env(safe-area-inset-bottom))]">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col rounded-t-[32px] rounded-b-[clamp(32px,14vw,62px)] bg-[#de1135] drop-shadow-[0px_2px_17.2px_rgba(0,0,0,0.16)]"
            >
              <div className="flex items-center gap-2 p-4">
                <svg className="size-6 shrink-0" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM11 16V18H13V16H11ZM11 6V14.5H13V6H11Z"
                    fill="#fff"
                  />
                </svg>
                <p className="min-w-px flex-1 text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-white">
                  {WARNING}
                </p>
              </div>

              <div className="relative flex flex-col gap-8 rounded-t-[32px] rounded-b-[clamp(32px,14vw,60px)] bg-white px-4 py-8">
                <h2 className="pr-14 font-display text-2xl font-bold leading-8 tracking-[-0.48px] text-black">
                  Purchase request
                </h2>

                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => router.push("/family")}
                  className="absolute right-4 top-7 flex size-11 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
                >
                  <CloseIcon className="size-6" />
                </button>

                <div className="flex flex-col items-center gap-[15px]">
                  <KidChip size="sm" />
                  <p className="font-display text-[72px] font-bold leading-[80px] tracking-[-1.08px] text-black">
                    {MODAL_TOTAL}
                  </p>
                </div>

                <div className="flex items-start gap-2 rounded-2xl bg-[#eff4fe] p-4">
                  <TickCircleIcon className="size-6 shrink-0" />
                  <div className="flex min-w-px flex-1 flex-col justify-center gap-1">
                    <p className="text-[17px] leading-[25px] tracking-[-0.17px] text-black">
                      {LIMIT_NOTE}
                    </p>
                    <p className="text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-[#276ef1]">
                      {LIMIT_LEFT}
                    </p>
                  </div>
                </div>

                <BlackButton onClick={() => setStep("review")}>Check reqeust</BlackButton>
              </div>
            </motion.div>
          </div>
        </div>
      </>
    );
  }

  if (step === "review") {
    return (
      <main className="min-h-dvh bg-white">
        <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col">
          <PageHeader title="Purchase request" color="text-black" onBack={() => setStep("modal")} />

          <div className="flex flex-col items-center gap-3 px-4 pt-10">
            <KidChip size="md" />
            <p className="font-display text-[64px] font-bold leading-[80px] tracking-[-0.96px] text-black">
              {AMOUNT}
            </p>
          </div>

          <div className="mt-[50px] flex flex-col gap-6 px-4 pb-[180px]">
            <div className="overflow-clip rounded-3xl border border-[#e8e8e8] bg-white">
              <div className="relative">
                <div className="flex items-start gap-3 border-b border-[#e8e8e8] px-4 py-3">
                  <span
                    className="size-11 shrink-0 overflow-hidden rounded-full"
                    style={{ backgroundColor: AVATARS[0].bg }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={AVATARS[0].src} alt="" className="size-full" />
                  </span>
                  <div className="flex flex-col gap-[5px]">
                    <p className="text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-black">
                      Parent wallet
                    </p>
                    <p className="text-[13px] leading-[18px] tracking-[-0.13px] text-black">
                      Available balance {BALANCE}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#eff4fe] text-black">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M5 5H19C20.1 5 21 5.9 21 7V19H16.5L15 16.5H9L7.5 19H3V7C3 5.9 3.9 5 5 5ZM7 9V11H5V13H7V15H9V13H11V11H9V9H7ZM15 10.5A1.25 1.25 0 1 0 15 13A1.25 1.25 0 0 0 15 10.5ZM17.5 12.5A1.25 1.25 0 1 0 17.5 15A1.25 1.25 0 0 0 17.5 12.5Z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                  <p className="text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-black">
                    To {MERCHANT}
                  </p>
                </div>
                <span className="absolute right-[25px] top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full border border-[#e8e8e8] bg-white p-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 4V19M12 19L6 13M12 19L18 13"
                      stroke="#000"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </div>
              <div className="flex items-center gap-2 bg-[#a0e1e1] px-5 pb-4 pt-3">
                <QuestionCircleFilledIcon className="size-5 shrink-0" mark="#a0e1e1" dot="#000" />
                <p className="min-w-px flex-1 text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-black">
                  This payment will be directly to merchant.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-3xl border border-[#e8e8e8] bg-white p-4 text-black">
              <p className="text-xl font-semibold leading-[25px] tracking-[-0.45px]">Bill details</p>
              <div className="flex items-center">
                <div className="flex min-w-px flex-1 flex-col gap-3">
                  <p className="text-[13px] leading-[18px] tracking-[-0.13px]">Items</p>
                  {BILL.map((b, i) => (
                    <p key={i} className={`text-[15px] leading-[22px] tracking-[-0.15px] ${"flagged" in b && b.flagged ? "text-[#de1135]" : ""}`}>{b.name}</p>
                  ))}
                </div>
                <div className="flex w-[70px] shrink-0 flex-col gap-3">
                  <p className="text-[13px] leading-[18px] tracking-[-0.13px]">Price</p>
                  {BILL.map((b, i) => (
                    <p key={i} className={`text-[15px] leading-[22px] tracking-[-0.15px] ${"flagged" in b && b.flagged ? "text-[#de1135]" : ""}`}>{b.price}</p>
                  ))}
                </div>
                <div className="flex w-[70px] shrink-0 flex-col gap-3 text-right">
                  <p className="text-[13px] leading-[18px] tracking-[-0.13px]">Amount</p>
                  {BILL.map((b, i) => (
                    <p key={i} className={`text-[15px] leading-[22px] tracking-[-0.15px] ${"flagged" in b && b.flagged ? "text-[#de1135]" : ""}`}>{b.amount}</p>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-4 border-t border-[#e8e8e8] pt-3">
                <div className="flex items-center justify-between text-[17px] font-medium leading-[22px] tracking-[-0.17px]">
                  <span>Subtotal</span>
                  <span>{BILL_TOTAL}</span>
                </div>
                <div className="flex items-center justify-between text-xl font-semibold leading-7 tracking-[-0.15px]">
                  <span>Total</span>
                  <span>{BILL_TOTAL}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-[520px] flex-col gap-2.5 bg-gradient-to-t from-white from-70% to-white/0 px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-6">
            <BlackButton onClick={() => setStep("pin")}>Approve</BlackButton>
            <SoftButton tone="red" onClick={() => router.push("/family")}>
              Decline
            </SoftButton>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col">
        <PageHeader title="Enter PIN" onBack={() => setStep("review")} />

        <div className="px-4 py-6">
          <div className="flex items-center gap-3 rounded-2xl bg-[#eff4fe] px-5 py-3">
            <PaypalMark className="size-10" />
            <div className="flex min-w-px flex-1 flex-col gap-[3px]">
              <p className="text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black">
                Pay {AMOUNT} to pixel cut
              </p>
              <p className="text-[13px] leading-[18px] tracking-[-0.13px] text-black">
                from parent wallet
              </p>
            </div>
          </div>
        </div>

        <div
          className="flex items-center justify-center gap-6 px-4 py-10"
          role="img"
          aria-label={`${pin.length} of 6 digits entered`}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={`size-6 rounded-full border transition-colors ${i < pin.length ? "border-[#e8e8e8] bg-black" : "border-[#a6a6a6] bg-white"}`}
            />
          ))}
        </div>

        <div className="mt-auto flex flex-col gap-8">
          <Keypad onKey={onKey} />
          <div className="px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
            <BlackButton disabled={pin.length < 6} onClick={confirm}>
              {loading ? <SpinnerIcon className="size-6 text-white" /> : "Confirm"}
            </BlackButton>
          </div>
        </div>
      </div>
    </main>
  );
}
