"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, SpinnerIcon } from "@/components/icons";
import { AVATARS } from "@/components/avatar-sheet";
import { getApi, postApi } from "@/lib/client-api";
import Keypad from "@/components/keypad";

// Parent flow, step 8: set up a 6-digit PIN, then confirm it.
// Uses the on-screen number pad from Figma. States: empty, partly filled,
// complete, confirm, loading and mismatch. The parent PIN is hashed on the server.
const LENGTH = 6;
const EASE = [0.22, 1, 0.36, 1] as const;

export default function PinScreen() {
  const router = useRouter();
  const [step, setStep] = useState<"create" | "confirm">("create");
  const [first, setFirst] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [toast, setToast] = useState<number | null>(null);
  const [me, setMe] = useState(0);

  const complete = pin.length === LENGTH;
  useEffect(() => {
    getApi<{ pinSet: boolean }>("/api/auth/parent/pin")
      .then((r) => {
        if (r.pinSet) router.replace("/family");
      })
      .catch((e) => setSaveError(e.message));
  }, [router]);

  // The picture picked on the profile screen
  useEffect(() => {
    try {
      const saved = Number(sessionStorage.getItem("pudding-avatar"));
      if (Number.isInteger(saved) && saved >= 0 && saved < AVATARS.length)
        setMe(saved);
    } catch {}
  }, []);

  // Snackbar goes away by itself
  useEffect(() => {
    if (toast === null) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const press = useCallback(
    (k: string) => {
      if (loading) return;
      setMismatch(false);
      setPin((p) => {
        if (k === "back") return p.slice(0, -1);
        if (k === "." || p.length >= LENGTH) return p;
        return p + k;
      });
    },
    [loading],
  );

  function submit() {
    if (loading || !complete) return;
    if (step === "create") {
      setFirst(pin);
      setPin("");
      setStep("confirm");
      return;
    }
    setLoading(true);
    if (pin !== first) {
      setLoading(false);
      setMismatch(true);
      setToast(Date.now());
      return;
    }
    postApi<{ nextRoute: string }>("/api/auth/parent/pin", { newPin: pin })
      .then(({ nextRoute }) => {
        router.replace(nextRoute);
        router.refresh();
      })
      .catch((e: unknown) => {
        setSaveError(e instanceof Error ? e.message : "Unable to save PIN.");
        setLoading(false);
      });
  }

  // Keyboard on a computer
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Enter") submit();
    }
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  });

  const barColor =
    complete || loading ? "bg-black text-white" : "bg-[#f3f3f3] text-[#a6a6a6]";

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto flex h-dvh w-full max-w-[520px] flex-col overflow-hidden bg-white">
        <div className="pt-[max(20px,env(safe-area-inset-top))]" />

        <AnimatePresence>
          {toast !== null && (
            <div
              key={toast}
              role="alert"
              className="pointer-events-none fixed inset-x-0 top-[max(20px,env(safe-area-inset-top))] z-40 flex h-11 items-center justify-center"
            >
              <motion.div
                initial={{ y: -72, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -72, opacity: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
                className="flex items-center rounded-xl bg-black px-3 py-2 text-[15px] leading-[22px] tracking-[-0.15px] text-white"
              >
                <AlertCircleIcon className="size-6 shrink-0" />
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: "auto", opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ delay: 0.25, duration: 0.3, ease: "easeOut" }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  <span className="block pl-2">PIN is not matching</span>
                </motion.div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <motion.header
          key={`h-${step}`}
          initial={step === "confirm" ? { x: "100%" } : false}
          animate={{ x: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="px-4 pb-8 pt-4"
        >
          <h1 className="font-display text-[32px] font-bold leading-[40px] tracking-[-0.64px] text-black">
            {step === "create"
              ? "Create a PIN for your Pudding account"
              : "Confirm PIN for your Pudding account"}
          </h1>
        </motion.header>

        {saveError && (
          <p role="alert" className="px-4 text-red-700">
            {saveError}{" "}
            <Link href="/account/security" className="underline">
              Manage existing PIN
            </Link>
          </p>
        )}
        {/* PIN dots */}
        <div className="min-h-0 flex-1 overflow-hidden pt-[18px]">
          <motion.div
            key={`d-${step}`}
            initial={step === "confirm" ? { x: "100%" } : false}
            animate={{ x: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="flex items-center justify-center gap-6 px-4 py-10"
            role="img"
            aria-label={`${pin.length} of ${LENGTH} digits entered`}
          >
            {Array.from({ length: LENGTH }).map((_, i) => (
              <span
                key={i}
                className={`size-6 rounded-full border transition-colors ${
                  i < pin.length
                    ? "border-[#e8e8e8] bg-black"
                    : "border-[#a6a6a6] bg-white"
                } ${mismatch ? "shadow-[0px_0px_0px_1px_#de1135]" : ""}`}
              />
            ))}
          </motion.div>
        </div>

        {/* Keypad + action */}
        <div className="flex flex-col gap-8">
          <Keypad onKey={press} />
          <div className="px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
            <button
              type="button"
              onClick={submit}
              disabled={!complete && !loading}
              aria-busy={loading}
              className={`flex h-[52px] w-full items-center justify-center rounded-full px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] transition-colors ${barColor}`}
            >
              {loading ? (
                <SpinnerIcon className="size-6 text-white" />
              ) : step === "create" ? (
                "Next"
              ) : (
                "Confirm"
              )}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
