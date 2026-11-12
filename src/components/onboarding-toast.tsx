"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircleIcon, TickCircleIcon } from "@/components/icons";

export type OnboardingToastMessage = {
  id: number;
  kind: "error" | "success";
  text: string;
};

export default function OnboardingToast({
  toast,
}: {
  toast: OnboardingToastMessage | null;
}) {
  return (
    <AnimatePresence>
      {toast && (
        <div
          key={toast.id}
          role={toast.kind === "error" ? "alert" : "status"}
          className="pointer-events-none absolute inset-x-0 top-[max(20px,env(safe-area-inset-top))] z-20 flex min-h-11 justify-center px-4"
        >
          {/* The icon drops in from the top, then the bar stretches out to the text */}
          <motion.div
            initial={{ y: -72, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -72, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="flex max-w-full items-center rounded-xl bg-black px-3 py-2 text-[15px] leading-[22px] tracking-[-0.15px] text-white"
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
              className="min-w-0 overflow-hidden"
            >
              <span className="block break-words pl-2">{toast.text}</span>
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
