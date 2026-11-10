"use client";

import { ChevronLeftIcon } from "@/components/icons";

// On-screen number pad used by the PIN and top-up screens.
// Calls onKey with "0"-"9", "." or "back".
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

export default function Keypad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <div className="grid grid-cols-3">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          aria-label={k === "back" ? "Delete" : k === "." ? "Decimal point" : k}
          onClick={() => onKey(k)}
          className="flex h-[clamp(52px,8.5dvh,69px)] items-center justify-center text-[28px] font-semibold leading-9 tracking-[-0.21px] text-black transition-colors active:bg-black/5"
        >
          {k === "back" ? <ChevronLeftIcon className="size-6" /> : k}
        </button>
      ))}
    </div>
  );
}
