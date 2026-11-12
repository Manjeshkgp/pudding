"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircleIcon, CalendarIcon, CloseIcon, PencilIcon, TickCircleIcon } from "@/components/icons";
import AvatarSheet, { AVATARS } from "@/components/avatar-sheet";
import LogoutSheet from "@/components/logout-sheet";

// Kid profile. Only the picture can be changed; tapping a field shows a note.
// Sample data only: nothing is saved.
const FIELDS = [
  { label: "First name", value: "Alex" },
  { label: "Last name", value: "Silvestri" },
  { label: "Date of birth", value: "11/01/2013", calendar: true },
];

type Toast = { kind: "ok" | "locked"; id: number } | null;

export default function KidProfileScreen() {
  const [avatar, setAvatar] = useState(1);
  const [sheet, setSheet] = useState(false);
  const [logout, setLogout] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      const i = Number(sessionStorage.getItem("pudding-avatar"));
      if (Number.isInteger(i) && AVATARS[i]) setAvatar(i);
    } catch {}
    return () => window.clearTimeout(timer.current);
  }, []);

  function show(kind: "ok" | "locked") {
    window.clearTimeout(timer.current);
    setToast({ kind, id: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), 3000);
  }

  function pick(i: number) {
    setAvatar(i);
    try {
      sessionStorage.setItem("pudding-avatar", String(i));
    } catch {}
    setSheet(false);
    show("ok");
  }

  return (
    <main className="min-h-dvh bg-white">
      <div className="relative mx-auto w-full max-w-[520px]">
        <div className="px-4 pt-[max(20px,env(safe-area-inset-top))]">
          <div className="flex h-11 items-center justify-between">
            <Link
              href="/home"
              aria-label="Close"
              className="flex size-11 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
            >
              <CloseIcon className="size-6 text-black" />
            </Link>
            <button
              type="button"
              onClick={() => setLogout(true)}
              className="rounded-full bg-[#fff0ee] px-4 py-3 text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-[#de1135]"
            >
              Logout
            </button>
          </div>
          <h1 className="pb-8 pt-6 font-display text-[32px] font-bold leading-10 tracking-[-0.64px] text-black">
            Profile
          </h1>
        </div>

        <div className="flex flex-col gap-6 px-4">
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
              aria-label="Change avatar"
              onClick={() => setSheet(true)}
              className="absolute bottom-0 right-0 flex size-7 items-center justify-center rounded-full bg-[#e8e8e8]"
            >
              <PencilIcon className="size-[21px] text-black" />
            </button>
          </div>

          {FIELDS.map((f) => (
            <div key={f.label} className="flex flex-col gap-2">
              <p className="text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black">{f.label}</p>
              <button
                type="button"
                onClick={() => show("locked")}
                className="flex h-14 w-full items-center rounded-lg bg-[#f3f3f3] p-2 text-left"
              >
                <span className="flex-1 px-2 text-[17px] leading-[25px] tracking-[-0.17px] text-black">{f.value}</span>
                {f.calendar && (
                  <span className="flex h-full items-center px-2">
                    <CalendarIcon className="size-6 text-black" />
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>

        <AnimatePresence>
          {toast && (
            <div
              key={toast.id}
              role="status"
              className="pointer-events-none absolute inset-x-0 top-[max(20px,env(safe-area-inset-top))] z-[60] flex h-11 items-center justify-center"
            >
              {/* The icon drops in from the top, then the bar stretches out to the text */}
              <motion.div
                initial={{ y: -72, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -72, opacity: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
                className="flex items-center rounded-xl bg-black px-3 py-2 text-[15px] leading-[22px] tracking-[-0.15px] text-white"
              >
                {toast.kind === "ok" ? (
                  <TickCircleIcon className="size-6 shrink-0" />
                ) : (
                  <AlertCircleIcon className="size-6 shrink-0" />
                )}
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: "auto", opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ delay: 0.25, duration: 0.3, ease: "easeOut" }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  <span className="block pl-2">
                    {toast.kind === "ok" ? "Avatar changed successfully." : "You can’t change this info"}
                  </span>
                </motion.div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      <LogoutSheet open={logout} onClose={() => setLogout(false)} />
      <AvatarSheet open={sheet} selected={avatar} onSelect={pick} onClose={() => setSheet(false)} />
    </main>
  );
}
