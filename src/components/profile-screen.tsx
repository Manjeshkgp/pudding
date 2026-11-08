"use client";

import Link from "next/link";
import HelpLink from "@/components/help-link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronLeftIcon,
  CloseCircleFilledIcon,
  PencilIcon,
  QuestionCircleIcon,
  SpinnerIcon,
} from "@/components/icons";
import AvatarSheet, { AVATARS } from "@/components/avatar-sheet";
import { useKeyboard } from "@/components/use-keyboard";

// Parent flow, step 8: your profile.
// States from Figma: idle, avatar list open, name focused (header shrinks),
// name typed (Continue turns black) and loading after Continue.
// Sample data only: nothing is saved.
const ease = { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const };

const circle =
  "flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]";

export default function ProfileScreen() {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [avatar, setAvatar] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { open, offset } = useKeyboard(nameRef);

  const valid = name.trim().length > 0;
  const onKeyboard = focused && open;

  function submit() {
    if (loading || !valid) return;
    setLoading(true);
    // The next screen shows the picture picked here
    try {
      sessionStorage.setItem("pudding-avatar", String(avatar));
    } catch {}
    window.setTimeout(() => router.push("/add-kid"), 1500);
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
            <Link href="/security-2" aria-label="Back" className={circle}>
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
              paddingBottom: focused ? 36 : 32,
            }}
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
                Your profile
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
              What will be you seen in your kid&rsquo;s app.
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
          {/* 120px picture with the edit badge at its bottom right */}
          <div className="relative size-[120px]">
            <span
              className="absolute inset-0 overflow-hidden rounded-full"
              style={{ backgroundColor: AVATARS[avatar].bg }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={AVATARS[avatar].src} alt="" className="size-full" />
            </span>
            <button
              type="button"
              aria-label="Edit picture"
              onClick={() => setSheetOpen(true)}
              className="absolute bottom-0 right-0 flex size-7 items-center justify-center rounded-full bg-[#e8e8e8]"
            >
              <PencilIcon className="size-[21px] text-black" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="name"
              className="text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black"
            >
              Name
            </label>
            <div
              className={`flex h-14 w-full items-center rounded-lg border-[3px] p-2 ${
                focused
                  ? "border-black bg-white"
                  : "border-transparent bg-[#f3f3f3]"
              }`}
            >
              <input
                ref={nameRef}
                id="name"
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint="done"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="Enter your name"
                className="h-full min-w-0 flex-1 bg-transparent px-2 text-[17px] leading-[25px] tracking-[-0.17px] text-black outline-none placeholder:text-[#5e5e5e]"
              />
              {focused && name && (
                <button
                  type="button"
                  aria-label="Clear name"
                  // keep the keyboard open
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setName("")}
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

      <AvatarSheet
        open={sheetOpen}
        selected={avatar}
        onSelect={(i) => {
          setAvatar(i);
          // let the check mark show for a moment, then close
          window.setTimeout(() => setSheetOpen(false), 250);
        }}
        onClose={() => setSheetOpen(false)}
      />
    </main>
  );
}
