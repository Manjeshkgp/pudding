"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import TopBar from "@/components/top-bar";
import {
  AlertCircleIcon,
  CloseCircleFilledIcon,
  SpinnerIcon,
  TickCircleIcon,
} from "@/components/icons";
import { useKeyboard } from "@/components/use-keyboard";

// Parent flow, step 4: email verification.
// States from Figma: empty, code entered, invalid code, resend active,
// code resent, and loading after Verify. Sample data only: the only
// code that works is 123456; any other code shows "Invalid code".
const SAMPLE_EMAIL = "parent.pudding@gmail.com";
const WAIT_SECONDS = 29;
const SAMPLE_CODE = "123456";

type Toast = { id: number; kind: "error" | "success"; text: string } | null;

export default function VerifyScreen() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [seconds, setSeconds] = useState(WAIT_SECONDS);
  const [toast, setToast] = useState<Toast>(null);
  const [email, setEmail] = useState(SAMPLE_EMAIL);
  const { open, offset } = useKeyboard(inputRef);

  const complete = code.length === 6;
  const onKeyboard = focused && open;

  // Show the email typed on the previous screen
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("pudding-email");
      if (saved) setEmail(saved);
    } catch {}
  }, []);

  // Resend countdown
  useEffect(() => {
    if (seconds <= 0) return;
    const t = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [seconds]);

  // Snackbar goes away by itself
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  function submit() {
    if (loading || !complete) return;
    setLoading(true);
    window.setTimeout(() => {
      if (code === SAMPLE_CODE) {
        // Correct code: keep the spinner while the next screen opens
        router.push("/password");
        return;
      }
      setLoading(false);
      setInvalid(true);
      setToast({ id: Date.now(), kind: "error", text: "Invalid code" });
    }, 1500);
  }

  function resend() {
    if (seconds > 0) return;
    setSeconds(WAIT_SECONDS);
    setToast({ id: Date.now(), kind: "success", text: "Code has been sent." });
  }

  function change(value: string) {
    setCode(value.replace(/\D/g, "").slice(0, 6));
    setInvalid(false);
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  const barText =
    "text-[17px] font-medium leading-[22px] tracking-[-0.17px] transition-colors";
  const barColor =
    complete || loading ? "bg-black text-white" : "bg-[#f3f3f3] text-[#a6a6a6]";
  const barInner = loading ? (
    <SpinnerIcon className="size-6 text-white" />
  ) : (
    code === "" ? "Continue" : "Verify"
  );

  return (
    <main className="min-h-dvh bg-white">
      <div className="relative w-full bg-white">
        <TopBar backHref="/email" />

        <AnimatePresence>
          {toast && (
            <div
              key={toast.id}
              role="status"
              className="pointer-events-none absolute inset-x-0 top-[max(20px,env(safe-area-inset-top))] z-20 flex h-11 items-center justify-center"
            >
              {/* The icon drops in from the top, then the bar stretches out to the text */}
              <motion.div
                initial={{ y: -72, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -72, opacity: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
                className="flex items-center rounded-xl bg-black px-3 py-2 text-[15px] leading-[22px] tracking-[-0.15px] text-white"
              >
                {toast.kind === "error" ? (
                  <AlertCircleIcon className="size-6 shrink-0" />
                ) : (
                  <TickCircleIcon className="size-6 shrink-0" />
                )}
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: "auto", opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ delay: 0.25, duration: 0.3, ease: "easeOut" }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  <span className="block pl-2">{toast.text}</span>
                </motion.div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <header className="flex flex-col gap-2 px-4 pb-8 pt-6">
          <h1 className="font-display text-[32px] font-bold leading-[40px] tracking-[-0.64px] text-black">
            Verify your email
          </h1>
          <p className="text-[17px] leading-[25px] tracking-[-0.17px] text-black">
            Enter the 6-digit verification code sent to
            <br />
            {email}
          </p>
        </header>

        <form
          className="flex flex-col gap-2 px-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label
            htmlFor="code"
            className="text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black"
          >
            Verification code
          </label>
          <div
            className={`flex h-14 w-full items-center rounded-lg border-[3px] p-2 ${
              invalid
                ? "border-[#de1135] bg-white"
                : focused
                  ? "border-black bg-white"
                  : "border-transparent bg-[#f3f3f3]"
            }`}
          >
            <input
              ref={inputRef}
              id="code"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => change(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Verification code"
              className="h-full min-w-0 flex-1 bg-transparent px-2 text-[17px] leading-[25px] tracking-[-0.17px] text-black outline-none placeholder:text-[#5e5e5e]"
            />
            {focused && code && (
              <button
                type="button"
                aria-label="Clear code"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => change("")}
                className="flex h-full shrink-0 items-center justify-center px-2"
              >
                <CloseCircleFilledIcon className="size-6 text-black" />
              </button>
            )}
          </div>
          <p className="text-[13px] leading-[18px] tracking-[-0.13px] text-[#5e5e5e]">
            Don&rsquo;t see our email, check your spam mail
          </p>
        </form>

        <div className="px-4 pt-6">
          <button
            type="button"
            onClick={resend}
            disabled={seconds > 0}
            className={`rounded-full px-4 py-3 text-[15px] font-medium leading-[19px] tracking-[-0.15px] bg-[#f3f3f3] ${
              seconds > 0 ? "text-[#a6a6a6]" : "text-black"
            }`}
          >
            {seconds > 0 ? `Resend in ${mm}:${ss}` : "Resend code"}
          </button>
        </div>
      </div>

      {onKeyboard ? (
        /* Flat Verify bar sitting on top of the keyboard */
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
        /* Verify pill at the bottom of the screen */
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
