"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarIcon,
  ChevronLeftIcon,
  CloseCircleFilledIcon,
  PencilIcon,
} from "@/components/icons";
import { useKeyboard } from "@/components/use-keyboard";
import AvatarSheet, { AVATARS } from "@/components/avatar-sheet";
import DatePickerSheet from "@/components/date-picker-sheet";
import { KIDS } from "@/components/crew-data";

// Edit a kid from the crew list. Sample data only: nothing is saved.
// While a name field is focused the big heading shrinks up into the top row.
const ease = { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const };

const circle =
  "flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]";
const label = "text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black";
const fieldText = "text-[17px] leading-[25px] tracking-[-0.17px]";

type FieldName = "first" | "last";

function format(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
}

export default function EditKidScreen({ index }: { index: number }) {
  const kid = KIDS[index];
  const router = useRouter();
  const lastRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLInputElement | null>(null);
  const wasOpen = useRef(false);
  const [first, setFirst] = useState(kid.first);
  const [last, setLast] = useState(kid.last);
  const [dob, setDob] = useState<Date>(kid.dob);
  const [focus, setFocus] = useState<FieldName | null>(null);
  const [calendar, setCalendar] = useState(false);
  const [avatar, setAvatar] = useState(kid.avatar);
  const [picker, setPicker] = useState(false);
  const [me, setMe] = useState(0);
  const { open } = useKeyboard(activeRef);

  const focused = focus !== null;
  const title = `Your ${kid.label} kid`;

  // Keyboard dismissed: drop focus so the header and button come back
  useEffect(() => {
    if (wasOpen.current && !open) {
      (document.activeElement as HTMLElement | null)?.blur();
      setFocus(null);
    }
    wasOpen.current = open;
  }, [open]);

  // The parent's picture from the profile screen
  useEffect(() => {
    try {
      const i = Number(sessionStorage.getItem("pudding-avatar"));
      if (Number.isInteger(i) && AVATARS[i]) setMe(i);
    } catch {}
  }, []);

  const { min, max } = useMemo(() => {
    const t = new Date();
    const y = t.getFullYear();
    return {
      max: new Date(y - 6, t.getMonth(), t.getDate()),
      min: new Date(y - 19, t.getMonth(), t.getDate() + 1),
    };
  }, []);

  const fields = [
    { name: "first" as const, title: "First name", value: first, set: setFirst, ref: undefined },
    { name: "last" as const, title: "Last name", value: last, set: setLast, ref: lastRef },
  ];

  return (
    <main className="min-h-dvh bg-white">
      <div className="px-4 pt-[max(20px,env(safe-area-inset-top))]">
        <div className="relative flex h-11 items-center justify-between">
          <Link href="/crew" aria-label="Back" className={circle}>
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
              {title}
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
            See these will be details of your kid
          </motion.p>
        </motion.div>
      </div>

      <div className="flex flex-col gap-6 pb-[140px]">
        {/* Picture with the pencil badge opens the avatar sheet */}
        <div className="px-4">
          <button
            type="button"
            aria-label="Change avatar"
            onClick={() => {
              (document.activeElement as HTMLElement | null)?.blur();
              setPicker(true);
            }}
            className="relative block size-[120px]"
          >
            <span
              className="absolute inset-0 overflow-hidden rounded-full"
              style={{ backgroundColor: AVATARS[avatar].bg }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={AVATARS[avatar].src} alt="" className="size-full" />
            </span>
            <span className="absolute bottom-0 right-0 flex size-7 items-center justify-center rounded-full bg-[#e8e8e8]">
              <PencilIcon className="size-[21px] text-black" />
            </span>
          </button>
        </div>

        <form
          className="flex flex-col gap-6 px-4"
          onSubmit={(e) => {
            e.preventDefault();
            router.push("/crew");
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
                    isFocused ? "border-black bg-white" : "border-transparent bg-[#f3f3f3]"
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
                    className={`h-full min-w-0 flex-1 bg-transparent px-2 text-black outline-none ${fieldText}`}
                  />
                  {isFocused && f.value && (
                    <button
                      type="button"
                      aria-label={`Clear ${f.title.toLowerCase()}`}
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
              <span className={`min-w-0 flex-1 px-2 text-black ${fieldText}`}>
                {format(dob)}
              </span>
              <span className="flex h-full items-center justify-center px-2">
                <CalendarIcon className="size-6 text-black" />
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* Hidden while typing so the keyboard never pushes it over the fields */}
      {!focused && (
        <div className="fixed inset-x-0 bottom-0 z-10 px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
          <button
            type="button"
            onClick={() => router.push("/crew")}
            className="flex h-[52px] w-full items-center justify-center rounded-full bg-black px-5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-white"
          >
            Save changes
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
      <AvatarSheet
        open={picker}
        selected={avatar}
        onSelect={(i) => {
          setAvatar(i);
          setPicker(false);
        }}
        onClose={() => setPicker(false)}
      />
    </main>
  );
}
