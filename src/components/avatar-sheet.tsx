"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckmarkIcon } from "@/components/icons";
import { AVATARS } from "@/lib/avatars";

export { AVATARS } from "@/lib/avatars";

// "Choose your avatar" card that slides up over a dimmed page.
export default function AvatarSheet({
  open,
  selected,
  onSelect,
  onClose,
}: {
  open: boolean;
  selected: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
            aria-label="Choose your avatar"
            className="absolute inset-x-0 bottom-0 px-2 pb-[max(8px,env(safe-area-inset-bottom))]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex max-h-[calc(100dvh-1rem)] w-full flex-col gap-6 overflow-y-auto rounded-t-[32px] rounded-b-[clamp(32px,14vw,60px)] bg-white px-4 py-8 drop-shadow-[0px_2px_17.2px_rgba(0,0,0,0.16)]">
              <h2 className="font-display text-[32px] font-bold leading-10 tracking-[-0.64px] text-black">
                Choose your avatar
              </h2>
              <div className="grid grid-cols-[repeat(3,minmax(0,100px))] gap-6">
                {AVATARS.map((a, i) => (
                  <button
                    key={a.id}
                    type="button"
                    aria-label={a.name}
                    aria-pressed={i === selected}
                    onClick={() => onSelect(i)}
                    className="relative aspect-square w-full"
                  >
                    <span
                      className="absolute inset-0 overflow-hidden rounded-full"
                      style={{ backgroundColor: a.bg }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.src} alt="" className="size-full" />
                    </span>
                    {i === selected && (
                      <span className="absolute bottom-0 right-0 flex size-6 items-center justify-center rounded-full bg-[#276ef1]">
                        <CheckmarkIcon className="size-[18px] text-white" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
