"use client";

import Link from "next/link";
import HelpLink from "@/components/help-link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  CloseCircleFilledIcon,
  QuestionCircleIcon,
  SpinnerIcon,
} from "@/components/icons";
import { useKeyboard } from "@/components/use-keyboard";
import { postApi } from "@/lib/client-api";

// Parent flow, step 6: security question.
// States from Figma: idle, question list open, answer focused (header
// shrinks), answer typed (Continue turns black) and loading after Continue.
// Sample data only: nothing is saved.
const QUESTIONS = [
  "The school you attended first",
  "The city or town you were born in",
  "Your childhood nickname",
  "The name of your first pet",
  "Your mother\u2019s maiden name",
  "The first concert you attended",
  "Your childhood best friend\u2019s name",
  "Your favourite childhood holiday destination",
];

// One easing for the whole header so everything moves together
const ease = { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const };

const circle =
  "flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]";
const label =
  "text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black";

export default function SecurityScreen({ step = 1 }: { step?: 1 | 2 }) {
  const router = useRouter();
  const answerRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<string | null>(null);
  // The second screen leaves out the question already used on the first one
  const [used, setUsed] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // The graphic only takes up space once its file exists
  const [graphic, setGraphic] = useState(false);
  const { open, offset } = useKeyboard(answerRef);

  const options = QUESTIONS.filter((q) => q !== used);
  const question = picked && options.includes(picked) ? picked : options[0];

  useEffect(() => {
    if (step !== 2) return;
    try {
      setUsed(sessionStorage.getItem("pudding-question-1"));
    } catch {}
  }, [step]);

  const valid = answer.trim().length > 0;
  const onKeyboard = focused && open;

  async function submit() {
    if (loading || !valid) return;
    setLoading(true);
    setError("");
    const questionKey = `security-${question
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")}`;
    try {
      await postApi("/api/auth/parent/signup/security-questions", {
        questionKey,
        questionText: question,
        answer: answer.trim(),
      });
      if (step === 1) {
        try {
          sessionStorage.setItem("pudding-question-1", question);
        } catch {}
        router.push("/security-2");
      } else {
        router.push("/profile");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save answer.");
      setLoading(false);
    }
  }

  const barText =
    "text-[17px] font-medium leading-[22px] tracking-[-0.17px] transition-colors";
  const barColor =
    valid || loading ? "bg-black text-white" : "bg-[#f3f3f3] text-[#a6a6a6]";
  const barInner = loading ? <SpinnerIcon className="size-6 text-white" /> : "Continue";

  return (
    <main className="min-h-dvh bg-white">
      <div className="w-full bg-white">
        {/* Header: while typing, the big heading shrinks up into the top row */}
        <div className="px-4 pt-[max(20px,env(safe-area-inset-top))]">
          <div className="flex h-11 items-center justify-between">
            <Link href={step === 1 ? "/password" : "/security"} aria-label="Back" className={circle}>
              <ChevronLeftIcon className="size-6 text-black" />
            </Link>
            <HelpLink
              aria-label="Help"
              className={`flex size-11 items-center justify-center rounded-full transition-all duration-300 ${
                focused
                  ? "bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
                  : "bg-white/65 shadow-[0px_8px_40px_0px_rgba(0,0,0,0.12)] backdrop-blur-xl"
              }`}
            >
              <QuestionCircleIcon className="size-6 text-black" />
            </HelpLink>
          </div>

          <motion.div
            initial={false}
            animate={{
              paddingTop: focused ? 0 : 24,
              // short header: 12px padding plus the 24px gap to the fields
              paddingBottom: focused ? 36 : 32,
            }}
            transition={ease}
          >
            {/* Graphic from Figma: public/images/security/graphic.svg */}
            <motion.div
              className="overflow-hidden"
              initial={false}
              animate={{
                height: focused || !graphic ? 0 : 76,
                marginBottom: focused || !graphic ? 0 : 8,
                opacity: focused ? 0 : 1,
              }}
              transition={ease}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/security/graphic.svg"
                alt=""
                className="h-16 w-auto"
                onLoad={() => setGraphic(true)}
              />
            </motion.div>
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
                Security question {step}
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
              We&rsquo;ll ask the 2 security questions you choose if you contact
              us for help
            </motion.p>
          </motion.div>
        </div>

        {error && <p role="alert" className="px-4 pb-3 text-sm text-red-700">{error}</p>}

        <form
          className="flex flex-col gap-6 px-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {/* First question: a list to pick from */}
          <div className="relative flex flex-col gap-2">
            <span className={label}>
              {step === 1 ? "First question" : "Second question"}
            </span>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className={`flex h-14 w-full items-center rounded-lg border-[3px] p-2 text-left ${
                menuOpen
                  ? "border-black bg-white"
                  : "border-transparent bg-[#f3f3f3]"
              }`}
            >
              <span className="min-w-0 flex-1 px-2 text-[17px] leading-[25px] tracking-[-0.17px] text-black">
                {question}
              </span>
              <span className="flex h-full items-center justify-center px-2">
                <ChevronDownIcon className="size-6 text-black" />
              </span>
            </button>

            {menuOpen && (
              <>
                {/* tap anywhere else to close */}
                <button
                  type="button"
                  aria-label="Close list"
                  tabIndex={-1}
                  className="fixed inset-0 z-20 cursor-default"
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  role="listbox"
                  style={{ scrollbarWidth: "thin", scrollbarColor: "#a6a6a6 transparent" }}
                  className="absolute inset-x-0 top-full z-30 mt-0.5 max-h-[152px] overflow-y-auto rounded-xl bg-white shadow-[0px_4px_16px_0px_rgba(0,0,0,0.12)]"
                >
                  {options.map((q) => (
                    <button
                      key={q}
                      type="button"
                      role="option"
                      aria-selected={q === question}
                      onClick={() => {
                        setPicked(q);
                        setMenuOpen(false);
                      }}
                      className={`flex h-[38px] w-full items-center border-[3px] bg-white px-[13px] text-left text-[15px] leading-[22px] tracking-[-0.15px] text-black ${
                        q === question ? "border-black" : "border-transparent"
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Answer */}
          <div className="flex flex-col gap-2">
            <label htmlFor="answer" className={label}>
              Answer
            </label>
            <div
              className={`flex h-14 w-full items-center rounded-lg border-[3px] p-2 ${
                focused
                  ? "border-black bg-white"
                  : "border-transparent bg-[#f3f3f3]"
              }`}
            >
              <input
                ref={answerRef}
                id="answer"
                autoComplete="off"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onFocus={() => {
                  setFocused(true);
                  setMenuOpen(false);
                }}
                onBlur={() => setFocused(false)}
                placeholder="Enter your answer"
                className="h-full min-w-0 flex-1 bg-transparent px-2 text-[17px] leading-[25px] tracking-[-0.17px] text-black outline-none placeholder:text-[#5e5e5e]"
              />
              {focused && answer && (
                <button
                  type="button"
                  aria-label="Clear answer"
                  // keep the keyboard open
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setAnswer("")}
                  className="flex h-full shrink-0 items-center justify-center px-2"
                >
                  <CloseCircleFilledIcon className="size-6 text-black" />
                </button>
              )}
            </div>
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
