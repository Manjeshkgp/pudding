"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import HelpLink from "@/components/help-link";
import { ChevronLeftIcon, QuestionCircleIcon } from "@/components/icons";
import { AVATARS } from "@/components/avatar-sheet";
import PaypalMark from "@/components/paypal-mark";
import Keypad from "@/components/keypad";

const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), {
  ssr: false,
});

// Parent flow: top up the parent wallet.
// Disclaimer sheet -> Add amount keypad -> Enter PIN -> adding sheet -> added sheet.
// Sample only: nothing is sent anywhere and the PIN is never checked or saved.
const PIN_LENGTH = 6;
const EASE = [0.22, 1, 0.36, 1] as const;

type Step = "amount" | "pin";
type Phase = "idle" | "adding" | "added";

function money(raw: string) {
  const n = Number(raw || "0");
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function DollarIcon() {
  return (
    <svg viewBox="0 0 28 28" className="size-7" aria-hidden="true">
      <circle cx="14" cy="14" r="11" fill="#000" />
      <path
        d="M17.6 11c-.2-1.4-1.6-2.3-3.6-2.3-2 0-3.5.9-3.5 2.4 0 3.4 7.4 1.6 7.4 5.3 0 1.6-1.5 2.6-3.7 2.6-2.1 0-3.6-1-3.8-2.5M14 7v14"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 28 28" className="size-7" aria-hidden="true">
      <path d="M4 4.5 24.5 14 4 23.5l2.6-8.2L15 14 6.6 12.7 4 4.5Z" fill="#000" />
    </svg>
  );
}

function Disclaimer({ onProceed }: { onProceed: () => void }) {
  const rows = [
    {
      icon: <DollarIcon />,
      title: "Your money stays in PayPal",
      text: "Top-ups increase your spending limit. No money is transferred to Pudding.",
    },
    {
      icon: <SendIcon />,
      title: "Pay only when approved",
      text: "Approved purchases are charged separately through your PayPal account.",
    },
  ];
  return (
    <motion.div
      className="fixed inset-0 z-50 flex justify-center bg-black/60"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div role="dialog" aria-label="Disclaimer" className="relative w-full max-w-[520px]">
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ duration: 0.45, ease: EASE }}
          className="absolute inset-x-0 bottom-0 px-2 pb-[max(8px,env(safe-area-inset-bottom))]"
        >
          <div className="flex w-full flex-col items-center gap-8 rounded-t-[32px] rounded-b-[clamp(32px,14vw,60px)] bg-white px-4 pb-8 pt-3 drop-shadow-[0px_2px_17.2px_rgba(0,0,0,0.16)]">
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/confused-cat.svg" alt="" className="size-[200px] object-contain" />
              <h2 className="font-display text-[32px] font-bold leading-10 tracking-[-0.64px] text-black">
                Disclaimer
              </h2>
            </div>
            <div className="flex w-full flex-col gap-5">
              {rows.map((r) => (
                <div key={r.title} className="flex items-start gap-5">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#eff4fe]">
                    {r.icon}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-black">
                    <p className="text-[17px] font-medium leading-[22px] tracking-[-0.17px]">
                      {r.title}
                    </p>
                    <p className="text-[15px] leading-[22px] tracking-[-0.15px]">{r.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={onProceed}
              className="flex h-[52px] w-full items-center justify-center rounded-full bg-black px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-white"
            >
              Proceed
            </button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// Coin that flips into a success tick (Lottie exported from Figma).
function StatusSheet({ done, amount }: { done: boolean; amount: string }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex justify-center bg-black/60"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <div role="status" className="relative w-full max-w-[520px]">
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="absolute inset-x-0 bottom-0 px-2 pb-[max(8px,env(safe-area-inset-bottom))]"
        >
          <div className="flex w-full flex-col items-center gap-8 rounded-t-[32px] rounded-b-[clamp(32px,14vw,60px)] bg-white px-4 py-8 drop-shadow-[0px_2px_17.2px_rgba(0,0,0,0.16)]">
            {/* Figma animation: coin pops in with a shine (frames 0-81), then flips into the tick (81-180) */}
            <div className="size-[100px]" aria-hidden="true">
              {done ? (
                <Lottie
                  key="tick"
                  src="/lottie/coin-to-tick.json"
                  segment={[81, 180]}
                  loop={false}
                  autoplay
                  className="size-full"
                />
              ) : (
                <Lottie
                  key="coin"
                  src="/lottie/coin-to-tick.json"
                  segment={[0, 81]}
                  loop={false}
                  autoplay
                  className="size-full"
                />
              )}
            </div>

            <div className="min-h-16 w-full">
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={done ? "added" : "adding"}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="text-balance text-center font-display text-[24px] font-bold leading-8 tracking-[-0.48px] text-black"
                >
                  {done
                    ? `You have added $${amount} to your parent wallet`
                    : `Adding dollar $${amount} to your parent wallet`}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

export default function TopupScreen() {
  const router = useRouter();
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [step, setStep] = useState<Step>("amount");
  const [raw, setRaw] = useState("");
  const [pin, setPin] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [shake, setShake] = useState(0);

  const amount = money(raw);
  const value = Number(raw || "0");
  const pinComplete = pin.length === PIN_LENGTH;
  const locked = showDisclaimer || phase !== "idle";

  const pressAmount = useCallback((k: string) => {
    setRaw((r) => {
      if (k === "back") return r.slice(0, -1);
      if (k === ".") return r.includes(".") ? r : (r === "" ? "0" : r) + ".";
      const [whole, dec] = r.split(".");
      if (r.includes(".")) return dec.length >= 2 ? r : r + k;
      if (whole.length >= 5) return r;
      return whole === "0" || whole === "" ? k : r + k;
    });
  }, []);

  const pressPin = useCallback((k: string) => {
    setPin((p) => {
      if (k === "back") return p.slice(0, -1);
      if (k === "." || p.length >= PIN_LENGTH) return p;
      return p + k;
    });
  }, []);

  const onKey = step === "amount" ? pressAmount : pressPin;

  function next() {
    if (step === "amount") {
      if (!(value > 0)) {
        setShake(Date.now());
        return;
      }
      setStep("pin");
      return;
    }
    if (!pinComplete) return;
    setPhase("adding");
  }

  function back() {
    if (step === "pin") {
      setPin("");
      setStep("amount");
    } else {
      router.push("/family");
    }
  }

  // Keyboard on a computer
  useEffect(() => {
    if (locked) return;
    function down(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9.]$/.test(e.key)) onKey(e.key);
      else if (e.key === "Backspace") onKey("back");
      else if (e.key === "Enter") next();
    }
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  });

  // adding -> added -> back to the parent home
  useEffect(() => {
    if (phase === "adding") {
      const t = window.setTimeout(() => setPhase("added"), 2400);
      return () => window.clearTimeout(t);
    }
    if (phase === "added") {
      const t = window.setTimeout(() => router.push("/family"), 2600);
      return () => window.clearTimeout(t);
    }
  }, [phase, router]);

  const amountText = `$${raw === "" ? "0" : raw}`;
  const amountSize =
    amountText.length > 8 ? "text-[56px] leading-[72px]" : amountText.length > 6 ? "text-[72px] leading-[88px]" : "text-[96px] leading-[112px]";

  const canNext = step === "amount" ? true : pinComplete;
  const btnColor = canNext ? "bg-black text-white" : "bg-[#f3f3f3] text-[#a6a6a6]";

  return (
    <main
      className={`min-h-dvh transition-colors duration-300 ${step === "amount" ? "bg-[#ffd7ef]" : "bg-white"}`}
    >
      <div className="mx-auto flex h-dvh w-full max-w-[520px] flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pb-3 pt-[max(20px,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={back}
            aria-label="Back"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
          >
            <ChevronLeftIcon className="size-6 text-black" />
          </button>
          <h1 className="flex-1 py-2.5 font-display text-[20px] font-semibold leading-[22px] tracking-[-0.2px] text-[#222]">
            {step === "amount" ? "Top-up" : "Enter PIN"}
          </h1>
          <HelpLink
            aria-label="Help"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
          >
            <QuestionCircleIcon className="size-6 text-black" />
          </HelpLink>
        </div>

        {/* Middle: amount or PIN dots */}
        <div className="relative min-h-0 flex-1">
          <AnimatePresence initial={false} mode="popLayout">
            {step === "amount" ? (
              <motion.div
                key="amount"
                initial={{ x: "-30%", opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: "-30%", opacity: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="absolute inset-0 flex items-center justify-center px-4"
              >
                <motion.p
                  key={shake}
                  animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : undefined}
                  transition={{ duration: 0.35 }}
                  className={`font-display font-bold tracking-[-1.44px] text-black ${amountSize}`}
                  aria-live="polite"
                >
                  {amountText}
                </motion.p>
              </motion.div>
            ) : (
              <motion.div
                key="pin"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ duration: 0.35, ease: EASE }}
                className="absolute inset-0 flex flex-col"
              >
                {/* Summary card */}
                <div className="px-4 pb-6 pt-3">
                  <div className="flex items-center justify-center gap-2.5 rounded-2xl bg-[#eff4fe] px-5 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-[3px] text-black">
                      <p className="text-[17px] font-medium leading-[22px] tracking-[-0.17px]">
                        Top up ${amount}
                      </p>
                      <p className="text-[13px] leading-[18px] tracking-[-0.13px]">
                        to Parent wallet
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <PaypalMark className="z-10 size-10" />
                      <span className="relative -ml-[13px] size-10 overflow-hidden rounded-full bg-[#ffd7ef]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={AVATARS[0].src}
                          alt=""
                          className="absolute left-[-3.5px] top-[3px] size-[35px] rotate-[16deg]"
                        />
                      </span>
                    </div>
                  </div>
                </div>

                {/* PIN dots */}
                <div className="flex flex-1 items-center justify-center gap-6 px-4 pb-20">
                  {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                    <span
                      key={i}
                      className={`size-6 rounded-full border transition-colors ${
                        i < pin.length ? "border-[#e8e8e8] bg-black" : "border-[#e8e8e8] bg-white"
                      }`}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Keypad + action */}
        <div className="flex flex-col gap-8">
          <Keypad onKey={onKey} />
          <div className="px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
            <button
              type="button"
              onClick={next}
              className={`flex h-[52px] w-full items-center justify-center rounded-full px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] transition-colors ${btnColor}`}
            >
              {step === "amount" ? "Next" : "Confirm"}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showDisclaimer && <Disclaimer onProceed={() => setShowDisclaimer(false)} />}
      </AnimatePresence>
      {phase !== "idle" && <StatusSheet done={phase === "added"} amount={amount} />}
    </main>
  );
}
