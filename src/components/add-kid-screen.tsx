"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarIcon,
  ChevronLeftIcon,
  CloseCircleFilledIcon,
  GiftIcon,
  TickCircleIcon,
  SpinnerIcon,
} from "@/components/icons";
import { useKeyboard } from "@/components/use-keyboard";
import { AVATARS } from "@/components/avatar-sheet";
import DatePickerSheet from "@/components/date-picker-sheet";

// Parent flow, step 9: add kid.
// States from Figma: idle, first / last name focused (header shrinks), date
// picker (calendar and year list), filled (buttons turn on) and loading.
// Sample data only: nothing is saved.
const ease = { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const };

const circle =
  "flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]";
const label =
  "text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black";
const fieldText =
  "text-[17px] leading-[25px] tracking-[-0.17px]";

type FieldName = "first" | "last";

function format(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
}

export default function AddKidScreen() {
  const lastRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLInputElement | null>(null);
  const wasOpen = useRef(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [dob, setDob] = useState<Date | null>(null);
  const [focus, setFocus] = useState<FieldName | null>(null);
  const [calendar, setCalendar] = useState(false);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [avatar, setAvatar] = useState(0);
  const [second, setSecond] = useState(false);
  const [toast, setToast] = useState(false);
  const { open } = useKeyboard(activeRef);

  // When the keyboard is dismissed (back gesture), drop focus so the header and buttons return
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

  // The picture picked on the profile screen
  useEffect(() => {
    try {
      const i = Number(sessionStorage.getItem("pudding-avatar"));
      if (Number.isInteger(i) && AVATARS[i]) setAvatar(i);
    } catch {}
  }, []);

  // Kids must be between 6 and 18 years old
  const { min, max } = useMemo(() => {
    const t = new Date();
    const y = t.getFullYear();
    return {
      max: new Date(y - 6, t.getMonth(), t.getDate()),
      min: new Date(y - 19, t.getMonth(), t.getDate() + 1),
    };
  }, []);

  const focused = focus !== null;
  const valid = first.trim() !== "" && last.trim() !== "" && dob !== null;

  function submit() {
    if (loading || !valid) return;
    setLoading(true);
    window.setTimeout(() => router.push("/crew"), 1500);
  }

  function addAnother() {
    if (loading || !valid) return;
    setFirst("");
    setLast("");
    setDob(null);
    setSecond(true);
    setToast(true);
  }

  const fields: {
    name: FieldName;
    title: string;
    placeholder: string;
    value: string;
    set: (v: string) => void;
    ref?: React.RefObject<HTMLInputElement | null>;
  }[] = [
    {
      name: "first",
      title: "First name",
      placeholder: "Enter kid’s first name",
      value: first,
      set: setFirst,
    },
    {
      name: "last",
      title: "Last name",
      placeholder: "Enter kid’s last name",
      value: last,
      set: setLast,
      ref: lastRef,
    },
  ];

  const barText =
    "text-[17px] font-medium leading-[22px] tracking-[-0.17px] transition-colors";
  const continueColor =
    valid || loading ? "bg-black text-white" : "bg-[#f3f3f3] text-[#a6a6a6]";
  const continueInner = loading ? (
    <SpinnerIcon className="size-6 text-white" />
  ) : (
    "Continue"
  );

  return (
    <main className="min-h-dvh bg-white">
      <div className="relative w-full bg-white">
        <AnimatePresence>
          {toast && (
            <div
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
                <TickCircleIcon className="size-6 shrink-0" />
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: "auto", opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ delay: 0.25, duration: 0.3, ease: "easeOut" }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  <span className="block pl-2">First kid added successfully.</span>
                </motion.div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Header: while typing, the big heading shrinks up into the top row */}
        <div className="px-4 pt-[max(20px,env(safe-area-inset-top))]">
          <div className="relative flex h-11 items-center justify-between">
            <Link href="/profile" aria-label="Back" className={circle}>
              <ChevronLeftIcon className="size-6 text-black" />
            </Link>
            <Link
              href="/account"
              aria-label="Account"
              className="size-11 overflow-hidden rounded-full"
              style={{ backgroundColor: AVATARS[avatar].bg }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={AVATARS[avatar].src} alt="" className="size-full" />
            </Link>
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
                {second ? "Add second kid" : "Add kid"}
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
              Add their details for accounts. Available for kids 6 to 18 years
              old.
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
            const isFocused = focus === f.name;
            return (
              <div key={f.name} className="flex flex-col gap-2">
                <label htmlFor={f.name} className={label}>
                  {f.title}
                </label>
                <div
                  className={`flex h-14 w-full items-center rounded-lg border-[3px] p-2 ${
                    isFocused
                      ? "border-black bg-white"
                      : "border-transparent bg-[#f3f3f3]"
                  }`}
                >
                  <input
                    ref={f.ref}
                    id={f.name}
                    autoComplete="off"
                    autoCapitalize="words"
                    enterKeyHint={f.name === "first" ? "next" : "done"}
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
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
                      if (f.name === "first") lastRef.current?.focus();
                      else (e.currentTarget as HTMLInputElement).blur();
                    }}
                    placeholder={f.placeholder}
                    className={`h-full min-w-0 flex-1 bg-transparent px-2 text-black outline-none placeholder:text-[#5e5e5e] ${fieldText}`}
                  />
                  {isFocused && f.value && (
                    <button
                      type="button"
                      aria-label={`Clear ${f.title.toLowerCase()}`}
                      // keep the keyboard open
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => f.set("")}
                      className="flex h-full shrink-0 items-center justify-center px-2"
                    >
                      <CloseCircleFilledIcon className="size-6 text-black" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Date of birth opens the calendar */}
          <div className="flex flex-col gap-2">
            <span className={label}>Date of birth</span>
            <button
              type="button"
              onClick={() => {
                (document.activeElement as HTMLElement | null)?.blur();
                setCalendar(true);
              }}
              className="flex h-14 w-full items-center rounded-lg border-[3px] border-transparent bg-[#f3f3f3] p-2 text-left"
            >
              <span
                className={`min-w-0 flex-1 px-2 ${fieldText} ${
                  dob ? "text-black" : "text-[#5e5e5e]"
                }`}
              >
                {dob ? format(dob) : "MM/DD/YYYY"}
              </span>
              <span className="flex h-full items-center justify-center px-2">
                <CalendarIcon className="size-6 text-black" />
              </span>
            </button>
          </div>

          {/* Sibling discount note, first kid only */}
          {!second && (
          <div className="flex items-start gap-3 rounded-lg bg-[#eff4fe] p-4">
            <GiftIcon className="size-5 shrink-0 text-black" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-[15px] tracking-[-0.15px] text-black">
              <p className="font-medium leading-[19px]">More kids, more savings!</p>
              <p className="leading-[22px]">
                You can add multiple children and enjoy special sibling discount
                on your plan.
              </p>
            </div>
          </div>
          )}
        </form>
      </div>

      {/* Add another and Continue sit at the bottom; hidden while typing so the keyboard never pushes them over the fields */}
      {!focused && (
        <div className="fixed inset-x-0 bottom-0 z-10 flex flex-col gap-2.5 px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
          <button
            type="button"
            onClick={addAnother}
            disabled={!valid || loading}
            className={`flex h-[52px] w-full items-center justify-center rounded-full px-5 py-3.5 ${barText} ${
              valid && !loading
                ? "bg-[#e8e8e8] text-black"
                : "bg-[#f3f3f3] text-[#a6a6a6]"
            }`}
          >
            Add another
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid && !loading}
            aria-busy={loading}
            className={`flex h-[52px] w-full items-center justify-center rounded-full px-5 py-3.5 ${barText} ${continueColor}`}
          >
            {continueInner}
          </button>
        </div>
      )}

      <DatePickerSheet
        open={calendar}
        value={dob}
        min={min}
        max={max}
        onSave={(d) => {
          setDob(d);
          setCalendar(false);
        }}
        onClose={() => setCalendar(false)}
      />
    </main>
  );
}
