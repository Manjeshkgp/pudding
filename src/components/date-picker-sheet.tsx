"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CloseIcon,
} from "@/components/icons";

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const same = (a: Date | null, b: Date | null) =>
  !!a && !!b && a.getTime() === b.getTime();

// "Select date" card that slides up over a dimmed page.
// Only dates between `min` and `max` can be picked.
export default function DatePickerSheet({
  open,
  value,
  min,
  max,
  onSave,
  onClose,
}: {
  open: boolean;
  value: Date | null;
  min: Date;
  max: Date;
  onSave: (d: Date) => void;
  onClose: () => void;
}) {
  const [pending, setPending] = useState<Date | null>(value);
  const [view, setView] = useState({ y: max.getFullYear(), m: max.getMonth() });
  const [years, setYears] = useState(false);
  const selectedYearRef = useRef<HTMLButtonElement>(null);

  // Start from the saved date (or the latest allowed month) each time it opens
  useEffect(() => {
    if (!open) return;
    const start = value ?? max;
    setPending(value);
    setView({ y: start.getFullYear(), m: start.getMonth() });
    setYears(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (years) selectedYearRef.current?.scrollIntoView({ block: "center" });
  }, [years]);

  const first = new Date(view.y, view.m, 1);
  const offset = (first.getDay() + 6) % 7; // week starts on Monday
  const count = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: count }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );

  const monthIndex = (y: number, m: number) => y * 12 + m;
  const canPrev = monthIndex(view.y, view.m) > monthIndex(min.getFullYear(), min.getMonth());
  const canNext = monthIndex(view.y, view.m) < monthIndex(max.getFullYear(), max.getMonth());

  function step(delta: number) {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }

  function pickYear(y: number) {
    // keep the month inside the allowed range
    let m = view.m;
    if (monthIndex(y, m) < monthIndex(min.getFullYear(), min.getMonth()))
      m = min.getMonth();
    if (monthIndex(y, m) > monthIndex(max.getFullYear(), max.getMonth()))
      m = max.getMonth();
    setView({ y, m });
    setYears(false);
  }

  const yearList: number[] = [];
  for (let y = min.getFullYear(); y <= max.getFullYear(); y++) yearList.push(y);

  const changed = pending !== null && !same(pending, value);

  const arrow =
    "flex size-8 items-center justify-center rounded-full bg-white transition-colors active:bg-[#f3f3f3] disabled:opacity-30 disabled:active:bg-white";

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40">
          <motion.button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            className="absolute inset-0 cursor-default bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-label="Select date"
            className="absolute inset-x-0 bottom-0 px-2 pb-[max(8px,env(safe-area-inset-bottom))]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex w-full flex-col gap-8 rounded-t-[32px] rounded-b-[clamp(32px,14vw,60px)] bg-white px-4 py-8 drop-shadow-[0px_2px_17.2px_rgba(0,0,0,0.16)]">
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-[19px]">
                  <div className="flex items-start justify-between">
                    <h2 className="font-display text-2xl font-bold leading-8 tracking-[-0.48px] text-black">
                      Select date
                    </h2>
                    <button type="button" aria-label="Close" onClick={onClose} className="transition-transform active:scale-90">
                      <CloseIcon className="size-6 text-black" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      aria-expanded={years}
                      onClick={() => setYears((v) => !v)}
                      className="flex items-center gap-[7px] rounded-full px-3 py-[5px] transition-colors active:bg-[#f3f3f3] text-[15px] leading-[22px] tracking-[-0.15px] text-black"
                    >
                      {MONTHS[view.m]} {view.y}
                      {years ? (
                        <ChevronUpIcon className="size-4" />
                      ) : (
                        <ChevronDownIcon className="size-4" />
                      )}
                    </button>
                    <div className="flex items-center">
                      <button
                        type="button"
                        aria-label="Previous month"
                        disabled={!canPrev}
                        onClick={() => step(-1)}
                        className={arrow}
                      >
                        <ChevronLeftIcon className="size-4 text-black" />
                      </button>
                      <button
                        type="button"
                        aria-label="Next month"
                        disabled={!canNext}
                        onClick={() => step(1)}
                        className={arrow}
                      >
                        <ChevronRightIcon className="size-4 text-black" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="relative h-[300px]">
                  <div className={years ? "opacity-0" : ""} aria-hidden={years}>
                    <div className="flex">
                      {WEEK.map((w, i) => (
                        <div
                          key={i}
                          className="flex h-11 flex-1 items-center justify-center text-[15px] leading-[22px] tracking-[-0.15px] text-[#5e5e5e]"
                        >
                          {w}
                        </div>
                      ))}
                    </div>
                    {rows.map((row, r) => (
                      <div key={r} className="flex">
                        {row.map((n, c) => {
                          if (n === null)
                            return (
                              <div key={c} className={`flex-1 ${r < 2 ? "h-10" : "h-11"}`} />
                            );
                          const date = new Date(view.y, view.m, n);
                          const disabled = date < day(min) || date > day(max);
                          const selected = same(pending, date);
                          return (
                            <div
                              key={c}
                              className={`flex flex-1 items-center justify-center ${r < 2 ? "h-10" : "h-11"}`}
                            >
                              <button
                                type="button"
                                disabled={disabled || years}
                                onClick={() => setPending(date)}
                                className={`flex size-8 items-center justify-center rounded-full text-[15px] leading-[22px] tracking-[-0.15px] transition-colors ${
                                  disabled ? "text-[#a6a6a6]" : "text-black active:bg-[#f3f3f3]"
                                } ${selected ? "bg-[#f3f3f3]" : ""}`}
                              >
                                {n}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {years && (
                    <div className="absolute inset-0 overflow-y-auto rounded-xl bg-white px-[22px] py-2">
                      <div className="grid grid-cols-[repeat(3,72px)] justify-between gap-y-4">
                        {yearList.map((y) => (
                          <button
                            key={y}
                            ref={y === view.y ? selectedYearRef : undefined}
                            type="button"
                            onClick={() => pickYear(y)}
                            className={`flex h-[38px] items-center justify-center rounded-full text-[15px] leading-[22px] tracking-[-0.15px] ${
                              y === view.y ? "bg-black text-white" : "text-black active:bg-[#f3f3f3]"
                            } transition-colors`}
                          >
                            {y}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => (changed && pending ? onSave(pending) : onClose())}
                className="flex h-[52px] w-full items-center justify-center rounded-full bg-black px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-white"
              >
                {changed ? "Save" : "Close"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
