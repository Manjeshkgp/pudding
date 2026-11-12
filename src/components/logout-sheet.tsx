"use client";

import { disableWebPush } from "@/lib/web-push-client";
import { postApi } from "@/lib/client-api";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), {
  ssr: false,
});

// Logout confirmation. "Yes! I am" only moves to the first screen, nothing is signed out for real.
export default function LogoutSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reduceMotion = useReducedMotion();

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
            aria-label="Log out"
            className="absolute inset-x-0 bottom-0 mx-auto max-w-[480px] px-2 pb-[max(8px,env(safe-area-inset-bottom))]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex w-full flex-col items-center gap-6 rounded-t-[32px] rounded-b-[clamp(32px,14vw,60px)] bg-white px-4 pb-8 pt-3 drop-shadow-[0px_2px_17.2px_rgba(0,0,0,0.16)]">
              <span className="h-[7px] w-10 rounded-full bg-[#e8e8e8]" />
              <div className="size-[240px]" aria-hidden="true">
                <Lottie
                  src="/lottie/crying-cat.json"
                  loop
                  autoplay={!reduceMotion}
                  className="size-full"
                />
              </div>
              <h2 className="w-full text-center font-display text-[32px] font-bold leading-10 tracking-[-0.64px] text-black">
                Are your sure you want to leave this journey?
              </h2>
              {error && <p role="alert">{error}</p>}
              <div className="flex w-full flex-col gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-[52px] w-full items-center justify-center rounded-full bg-[#e8e8e8] px-5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black shadow-[inset_-2px_-4px_32px_rgba(255,255,255,0.3)] transition-colors active:bg-[#dcdcdc]"
                >
                  No! I am not
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await disableWebPush().catch(() => undefined);
                      await postApi("/api/auth/logout", {});
                      sessionStorage.clear();
                      router.replace("/start");
                      router.refresh();
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Unable to sign out",
                      );
                      setBusy(false);
                    }
                  }}
                  className="flex h-[52px] w-full items-center justify-center rounded-full bg-[#fff0ee] px-5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-[#de1135] shadow-[inset_-2px_-4px_32px_rgba(255,255,255,0.3)] transition-colors active:bg-[#ffe3df]"
                >
                  Yes! I am
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
