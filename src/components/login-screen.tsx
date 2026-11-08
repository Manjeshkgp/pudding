"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import HelpLink from "@/components/help-link";
import {
  AlertCircleIcon,
  ChevronLeftIcon,
  CloseCircleFilledIcon,
  EyeClosedIcon,
  EyeIcon,
  QuestionCircleIcon,
  SpinnerIcon,
} from "@/components/icons";
import { useKeyboard } from "@/components/use-keyboard";

// Parent login. States from Figma: idle, email focused, email typed, password
// focused, password typed (hidden / shown), error ("Combination is invalid")
// and loading. Sample data only: the first attempt always shows the error,
// the second one signs in. Nothing is sent anywhere.
const ease = { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const };

const circle =
  "flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]";
const label = "text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black";
const MIN_PASSWORD = 8;

type FieldName = "email" | "password";

export default function LoginScreen() {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLInputElement | null>(null);
  const wasOpen = useRef(false);
  const attempts = useRef(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [focus, setFocus] = useState<FieldName | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState(false);
  const { open, offset } = useKeyboard(activeRef);

  const focused = focus !== null;
  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= MIN_PASSWORD;
  const onKeyboard = (focused && open) || ((loading || error) && open);

  // Keyboard dismissed (back gesture): drop focus so the header comes back
  useEffect(() => {
    if (wasOpen.current && !open) {
      (document.activeElement as HTMLElement | null)?.blur();
      setFocus(null);
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(false), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  function edit(set: (v: string) => void, v: string) {
    set(v);
    if (error) setError(false);
  }

  function submit() {
    if (loading || !valid) return;
    setLoading(true);
    setError(false);
    window.setTimeout(() => {
      setLoading(false);
      attempts.current += 1;
      if (attempts.current === 1) {
        setError(true);
        setToast(true);
      } else {
        router.push("/crew");
      }
    }, 1500);
  }

  const fields: {
    name: FieldName;
    title: string;
    placeholder: string;
    value: string;
    set: (v: string) => void;
  }[] = [
    { name: "email", title: "Email", placeholder: "Enter your mail", value: email, set: setEmail },
    { name: "password", title: "Password", placeholder: "Enter your password", value: password, set: setPassword },
  ];

  const barText = "text-[17px] font-medium leading-[22px] tracking-[-0.17px] transition-colors";
  const barColor = valid || loading ? "bg-black text-white" : "bg-[#f3f3f3] text-[#a6a6a6]";
  const barInner = loading ? <SpinnerIcon className="size-6 text-white" /> : "Continue";

  return (
    <main className="min-h-dvh bg-white">
      <div className="relative w-full bg-white">
        <AnimatePresence>
          {toast && (
            <div
              role="alert"
              className="pointer-events-none absolute inset-x-0 top-[max(20px,env(safe-area-inset-top))] z-20 flex h-11 items-center justify-center"
            >
              <motion.div
                initial={{ y: -72, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -72, opacity: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
                className="flex items-center gap-2 rounded-xl bg-black px-3 py-2 text-[15px] leading-[22px] tracking-[-0.15px] text-white"
              >
                <AlertCircleIcon className="size-6 shrink-0" />
                <span className="whitespace-nowrap">Combination is invalid</span>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Header: while typing, the big heading shrinks up into the top row */}
        <div className="px-4 pt-[max(20px,env(safe-area-inset-top))]">
          <div className="relative flex h-11 items-center justify-between">
            <Link href="/parent" aria-label="Back" className={circle}>
              <ChevronLeftIcon className="size-6 text-black" />
            </Link>
            <HelpLink aria-label="Help" className={circle}>
              <QuestionCircleIcon className="size-6 text-black" />
            </HelpLink>
          </div>

          <motion.div
            initial={false}
            animate={{ paddingTop: focused ? 0 : 24, paddingBottom: focused ? 36 : 32 }}
            transition={ease}
          >
            <motion.div
              className="relative z-10"
              initial={false}
              animate={{ height: focused ? 0 : 40 }}
              transition={ease}
            >
              <motion.h1
                className="pointer-events-none absolute left-0 top-0 whitespace-nowrap font-display"
                initial={false}
                animate={{
                  x: focused ? 56 : 0,
                  y: focused ? -33 : 0,
                  fontSize: focused ? 20 : 32,
                  lineHeight: focused ? "22px" : "40px",
                  letterSpacing: focused ? "-0.2px" : "-0.64px",
                  fontWeight: focused ? 600 : 700,
                  color: focused ? "#222222" : "#000000",
                }}
                transition={ease}
              >
                {focused ? "Log in" : "Nice to see you again"}
              </motion.h1>
            </motion.div>
            <motion.p
              className="overflow-hidden text-[17px] leading-[25px] tracking-[-0.17px] text-black"
              initial={false}
              animate={{
                height: focused ? 0 : "auto",
                opacity: focused ? 0 : 1,
                marginTop: focused ? 0 : 8,
              }}
              transition={ease}
            >
              Pick up where you left off your journey.
            </motion.p>
          </motion.div>
        </div>

        <form
          className="flex flex-col gap-6 px-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {fields.map((f) => {
            const isEmail = f.name === "email";
            const isFocused = focus === f.name && !loading && !error;
            return (
              <div key={f.name} className="flex flex-col gap-2">
                <label htmlFor={f.name} className={label}>
                  {f.title}
                </label>
                <div
                  className={`flex h-14 w-full items-center rounded-lg border-[3px] p-2 ${
                    isFocused ? "border-black bg-white" : "border-transparent bg-[#f3f3f3]"
                  }`}
                >
                  <input
                    ref={isEmail ? undefined : passwordRef}
                    id={f.name}
                    type={isEmail ? "email" : shown ? "text" : "password"}
                    inputMode={isEmail ? "email" : undefined}
                    autoComplete={isEmail ? "email" : "current-password"}
                    autoCapitalize="none"
                    enterKeyHint={isEmail ? "next" : "go"}
                    value={f.value}
                    onChange={(e) => edit(f.set, e.target.value)}
                    onFocus={(e) => {
                      activeRef.current = e.currentTarget;
                      setFocus(f.name);
                    }}
                    onBlur={() =>
                      // moving straight to the other field must not collapse the header
                      window.setTimeout(
                        () => setFocus((cur) => (cur === f.name ? null : cur)),
                        60,
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (isEmail) passwordRef.current?.focus();
                      else submit();
                    }}
                    placeholder={f.placeholder}
                    className="h-full min-w-0 flex-1 bg-transparent px-2 text-[17px] leading-[25px] tracking-[-0.17px] text-black outline-none placeholder:text-[#5e5e5e]"
                  />
                  {error ? (
                    <span className="flex h-full shrink-0 items-center justify-center px-2">
                      <AlertCircleIcon className="size-6" />
                    </span>
                  ) : isFocused && f.value && isEmail ? (
                    <button
                      type="button"
                      aria-label="Clear email"
                      // keep the keyboard open
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => edit(setEmail, "")}
                      className="flex h-full shrink-0 items-center justify-center px-2"
                    >
                      <CloseCircleFilledIcon className="size-6 text-black" />
                    </button>
                  ) : isFocused && f.value && !isEmail ? (
                    <button
                      type="button"
                      aria-label={shown ? "Hide password" : "Show password"}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShown((v) => !v)}
                      className="flex h-full shrink-0 items-center justify-center px-2"
                    >
                      {shown ? (
                        <EyeIcon className="size-6 text-black" />
                      ) : (
                        <EyeClosedIcon className="size-6 text-black" />
                      )}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}

          <div className="py-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              className="flex h-[43px] items-center justify-center rounded-full bg-[#f3f3f3] px-4 py-3 text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-black"
            >
              Forgot password?
            </button>
          </div>
        </form>
      </div>

      {onKeyboard ? (
        /* Flat Continue bar sitting on top of the keyboard */
        <div className="fixed inset-x-0 z-10" style={{ bottom: offset }}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
            disabled={!valid && !loading}
            aria-busy={loading}
            className={`flex h-[52px] w-full items-center justify-center px-5 py-3.5 ${barText} ${barColor}`}
          >
            {barInner}
          </button>
        </div>
      ) : (
        /* Continue pill at the bottom of the screen */
        <div className="fixed inset-x-0 bottom-0 z-10 px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
          <button
            type="button"
            onClick={submit}
            disabled={!valid && !loading}
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
