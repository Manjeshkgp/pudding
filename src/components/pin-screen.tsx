"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, SpinnerIcon } from "@/components/icons";
import { AVATARS } from "@/components/avatar-sheet";
import { useKeyboard } from "@/components/use-keyboard";

// Parent flow, step 8: set up a 6-digit PIN, then confirm it.
// States from Figma: empty, partly filled, complete, confirm, loading and
// "PIN is not matching". Sample only: the PIN stays on this screen and is
// never saved or sent anywhere.
const LENGTH = 6;

export default function PinScreen() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"create" | "confirm">("create");
  const [first, setFirst] = useState("");
  const [pin, setPin] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [toast, setToast] = useState<number | null>(null);
  const [me, setMe] = useState(0);
  const { open, offset } = useKeyboard(inputRef);

  const complete = pin.length === LENGTH;
  const onKeyboard = focused && open;

  // The picture picked on the profile screen
  useEffect(() => {
    try {
      const saved = Number(sessionStorage.getItem("pudding-avatar"));
      if (Number.isInteger(saved) && saved >= 0 && saved < AVATARS.length) setMe(saved);
    } catch {}
  }, []);

  // Snackbar goes away by itself
  useEffect(() => {
    if (toast === null) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  function change(value: string) {
    setPin(value.replace(/\D/g, "").slice(0, LENGTH));
    setMismatch(false);
  }

  function submit() {
    if (loading || !complete) return;
    if (step === "create") {
      setFirst(pin);
      setPin("");
      setStep("confirm");
      inputRef.current?.focus();
      return;
    }
    setLoading(true);
    window.setTimeout(() => {
      if (pin === first) {
        // Keep the spinner while the next screen opens
        router.push("/done");
        return;
      }
      setLoading(false);
      setMismatch(true);
      setToast(Date.now());
    }, 1200);
  }

  const barText =
    "text-[17px] font-medium leading-[22px] tracking-[-0.17px] transition-colors";
  const barColor =
    complete || loading ? "bg-black text-white" : "bg-[#f3f3f3] text-[#a6a6a6]";
  const barInner = loading ? (
    <SpinnerIcon className="size-6 text-white" />
  ) : step === "create" ? (
    "Next"
  ) : (
    "Confirm"
  );

  return (
    <main className="min-h-dvh bg-white">
      <div className="relative w-full bg-white">
        <div className="sticky top-0 z-30 flex items-center justify-end bg-white px-4 pb-2 pt-[max(20px,env(safe-area-inset-top))]">
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

        <AnimatePresence>
          {toast !== null && (
            <div
              key={toast}
              role="alert"
              className="pointer-events-none fixed inset-x-0 top-[max(20px,env(safe-area-inset-top))] z-40 flex h-11 items-center justify-center"
            >
              <motion.div
                initial={{ y: -72, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -72, opacity: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
                className="flex items-center rounded-xl bg-black px-3 py-2 text-[15px] leading-[22px] tracking-[-0.15px] text-white"
              >
                <AlertCircleIcon className="size-6 shrink-0" />
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: "auto", opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ delay: 0.25, duration: 0.3, ease: "easeOut" }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  <span className="block pl-2">PIN is not matching</span>
                </motion.div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <motion.header
          key={`h-${step}`}
          initial={step === "confirm" ? { x: "100%" } : false}
          animate={{ x: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="px-4 pb-8 pt-4"
        >
          <h1 className="font-display text-[32px] font-bold leading-[40px] tracking-[-0.64px] text-black">
            {step === "create"
              ? "Create a PIN for your Pudding account"
              : "Confirm PIN for your Pudding account"}
          </h1>
        </motion.header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="relative">
            <motion.div
              key={`d-${step}`}
              initial={step === "confirm" ? { x: "100%" } : false}
          animate={{ x: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center justify-center gap-8 px-4 py-10"
            >
              {Array.from({ length: LENGTH }).map((_, i) => (
                <span
                  key={i}
                  className={`size-6 rounded-full border transition-colors ${
                    i < pin.length ? "border-[#e8e8e8] bg-black" : "border-[#a6a6a6] bg-white"
                  } ${mismatch ? "shadow-[0px_0px_0px_1px_#de1135]" : ""}`}
                />
              ))}
            </motion.div>
            {/* The real input sits invisibly over the circles, so tapping them opens the keyboard */}
            <input
              ref={inputRef}
              autoFocus
              aria-label={step === "create" ? "Create a 6-digit PIN" : "Confirm your 6-digit PIN"}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={LENGTH}
              value={pin}
              onChange={(e) => change(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className="absolute inset-0 size-full cursor-default bg-transparent text-[16px] text-transparent caret-transparent opacity-0 outline-none"
            />
          </div>
        </form>
      </div>

      {onKeyboard ? (
        /* Flat bar sitting on top of the keyboard */
        <div className="fixed inset-x-0 z-10" style={{ bottom: offset }}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
            disabled={!complete && !loading}
            aria-busy={loading}
            className={`flex h-[52px] w-full items-center justify-center px-5 py-3.5 ${barText} ${barColor}`}
          >
            {barInner}
          </button>
        </div>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-10 px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
          <button
            type="button"
            onClick={submit}
            disabled={!complete && !loading}
            aria-busy={loading}
            className={`flex h-[52px] w-full items-center justify-center rounded-full px-5 py-3.5 ${barText} ${barColor}`}
          >
            {barInner}
          </button>
        </div>
      )}
    </main>
  );
}
