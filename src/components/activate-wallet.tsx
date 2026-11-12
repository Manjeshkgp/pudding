"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import HelpLink from "@/components/help-link";
import Keypad from "@/components/keypad";
import ScrollHeader from "@/components/scroll-header";
import { ChevronLeftIcon, CloseCircleFilledIcon, QuestionCircleFilledIcon, QuestionCircleIcon } from "@/components/icons";

// Parent flow: activate a kid's wallet.
// Spending limits and controls -> Enter PIN -> kid credentials (hidden until Reveal).
// Sample only: nothing is sent anywhere, the PIN is never checked and the credentials are made up.
const PIN_LENGTH = 6;

type Step = "limits" | "pin" | "creds";

// Credential card icons, exported from Figma (key-m and user-m).
function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M14 10.5H26.25V17.5H23.917V21H21.4443V15.6436H19.2285V21H16.917V17.5H14V21H1.75V7H14V10.5ZM6.5625 11.6641V16.3311H8.89551V11.6641H6.5625Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PersonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M13.9998 2.33203C11.1003 2.33203 8.74984 4.68254 8.74984 7.58203C8.74984 10.4815 11.1003 12.832 13.9998 12.832C16.8993 12.832 19.2498 10.4815 19.2498 7.58203C19.2498 4.68254 16.8993 2.33203 13.9998 2.33203Z"
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
      />
      <path
        d="M13.9998 14.582C8.84518 14.582 4.6665 18.7607 4.6665 23.9154V25.6654H23.3332V23.9154C23.3332 18.7607 19.1545 14.582 13.9998 14.582Z"
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
      />
    </svg>
  );
}

// Scratch-off cover: drag a finger (or the mouse) over it to wipe it away.
// Once most of it is gone the rest fades out and onDone fires.
function ScratchCover({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const finished = useRef(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    // little sparkle dots so it reads as a scratch surface
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.14})`;
      ctx.beginPath();
      ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 1.6 + 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#fff";
    ctx.font = "700 24px 'Bricolage Grotesque', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Scratch me", width / 2, height / 2);
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function scratch(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    const from = last.current ?? p;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = 44;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();
    last.current = p;
  }

  function cleared() {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return 0;
    const { width, height } = c;
    const data = ctx.getImageData(0, 0, width, height).data;
    let clear = 0;
    let total = 0;
    const step = 6;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        total++;
        if (data[(y * width + x) * 4 + 3] < 40) clear++;
      }
    }
    return clear / total;
  }

  function check() {
    if (finished.current) return;
    if (cleared() > 0.5) {
      finished.current = true;
      setGone(true);
      try {
        navigator.vibrate?.(12);
      } catch {}
      setTimeout(onDone, 280);
    }
  }

  return (
    <canvas
      ref={ref}
      aria-label="Scratch to reveal the credentials"
      className="absolute inset-0 size-full cursor-grab touch-none transition-opacity duration-300 active:cursor-grabbing"
      style={{ opacity: gone ? 0 : 1 }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = true;
        last.current = null;
        scratch(e);
      }}
      onPointerMove={(e) => {
        if (drawing.current) scratch(e);
      }}
      onPointerUp={() => {
        drawing.current = false;
        last.current = null;
        check();
      }}
      onPointerCancel={() => {
        drawing.current = false;
        last.current = null;
      }}
    />
  );
}

function IconButton({ onClick, label, children }: { onClick?: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
    >
      {children}
    </button>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="flex h-12 w-[52px] shrink-0 items-center justify-center"
    >
      <span className={`relative h-[31px] w-[51px] rounded-full transition-colors duration-200 ${on ? "bg-black" : "bg-[#e8e8e8]"}`}>
        <span
          className={`absolute left-[2px] top-[2px] size-[27px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-transform duration-200 ${
            on ? "translate-x-5" : ""
          }`}
        />
      </span>
    </button>
  );
}

function MoneyField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2 px-4">
      <label htmlFor={label} className="text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black">
        {label}
      </label>
      <div
        className={`flex h-14 items-center rounded-lg p-2 ${
          focused ? "border-[3px] border-black bg-white" : "bg-[#f3f3f3]"
        }`}
        onClick={() => ref.current?.focus()}
      >
        <span className="px-2 text-[18px] font-medium leading-6 text-black">$</span>
        <input
          id={label}
          ref={ref}
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.]/g, "");
            const [whole, ...rest] = v.split(".");
            const next = rest.length ? `${whole.slice(0, 5)}.${rest.join("").slice(0, 2)}` : whole.slice(0, 5);
            onChange(next);
          }}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
          }}
          className="min-w-0 flex-1 bg-transparent px-2 text-[17px] leading-[25px] tracking-[-0.17px] text-black outline-none placeholder:text-black"
        />
        {focused && value && (
          <button
            type="button"
            aria-label="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange("")}
            className="px-2"
          >
            <CloseCircleFilledIcon className="size-6" />
          </button>
        )}
      </div>
      <div className="flex items-start gap-1">
        <span className="flex items-start py-[3px]">
          <QuestionCircleFilledIcon className="size-4" dot="#5e5e5e" mark="#fff" />
        </span>
        <p className="min-w-px flex-1 text-[13px] leading-[18px] tracking-[-0.13px] text-[#5e5e5e]">{hint}</p>
      </div>
    </div>
  );
}

function Row({ title, text, on, onChange, last }: { title: string; text: React.ReactNode; on: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <div className={`flex items-center justify-center gap-8 py-5 first:pt-0 ${last ? "pb-0" : "border-b border-[#e8e8e8]"}`}>
      <div className="flex min-w-px flex-1 flex-col gap-1.5 text-black">
        <p className="text-[17px] font-medium leading-[22px] tracking-[-0.17px]">{title}</p>
        <p className="text-[13px] leading-[18px] tracking-[-0.13px]">{text}</p>
      </div>
      <Switch on={on} onChange={onChange} label={title} />
    </div>
  );
}

function BottomButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-[52px] w-full items-center justify-center rounded-full px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] transition-colors ${
        disabled ? "bg-[#f3f3f3] text-[#a6a6a6]" : "bg-black text-white"
      }`}
    >
      {children}
    </button>
  );
}

export default function ActivateWallet({ name }: { name: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("limits");
  const [weekly, setWeekly] = useState("");
  const [single, setSingle] = useState("");
  const [instore, setInstore] = useState(false);
  const [online, setOnline] = useState(true);
  const [ageBlock, setAgeBlock] = useState(true);
  // The phone keyboard is open while a field has focus; Continue steps aside for it.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const on = () => setTyping(true);
    const off = () => setTyping(false);
    const onIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement) on();
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", off);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", off);
    };
  }, []);
  const [pin, setPin] = useState("");
  const [revealed, setRevealed] = useState(false);

  // Fixed sample credentials
  const username = `${name}1245`;
  const password = "Axesilva@1345";

  function onKey(k: string) {
    if (k === "back") setPin((p) => p.slice(0, -1));
    else if (k !== "." && pin.length < PIN_LENGTH) setPin((p) => p + k);
  }

  const header = (title?: string) => (
    <div className="flex items-center gap-3 px-4">
      <IconButton
        label="Back"
        onClick={() => (step === "pin" ? setStep("limits") : router.push("/family"))}
      >
        <ChevronLeftIcon className="size-6" />
      </IconButton>
      {title && (
        <p className="font-display min-w-px flex-1 py-2.5 text-[20px] font-semibold leading-[22px] tracking-[-0.2px] text-[#222]">
          {title}
        </p>
      )}
      {!title && <span className="flex-1" />}
      <HelpLink aria-label="Help" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]">
        <QuestionCircleIcon className="size-6" />
      </HelpLink>
    </div>
  );

  if (step === "creds") {
    return (
      <main className="min-h-dvh bg-[#a0e1e1]">
        <div className="relative mx-auto flex min-h-dvh w-full max-w-[520px] items-center justify-center px-4">
          <div className="relative">
          <h1 className="absolute bottom-full left-1/2 mb-8 -translate-x-1/2 whitespace-nowrap font-display text-[32px] font-bold leading-10 tracking-[-0.64px] text-black">{name} credentials</h1>
          <div
            className={`relative flex flex-col gap-5 overflow-clip rounded-[32px] px-8 py-5 transition-colors duration-300 ${
              revealed ? "bg-white" : "bg-[#ffd7ef]"
            }`}
          >
            <div className="flex items-center gap-4">
              <PersonIcon className="size-7 text-black" />
              <p className="font-display text-[24px] font-bold leading-8 tracking-[-0.48px] text-black">{username}</p>
            </div>
            <div className="flex items-center gap-4">
              <KeyIcon className="size-7 text-black" />
              <p className="font-display text-[24px] font-bold leading-8 tracking-[-0.48px] text-black">{password}</p>
            </div>
            {!revealed && <ScratchCover onDone={() => setRevealed(true)} />}
          </div>
          </div>
        </div>
        <AnimatePresence>
          {revealed && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-[520px] flex-col items-center gap-6 px-4 pb-[max(40px,env(safe-area-inset-bottom))]"
            >
              <div className="flex items-center gap-3">
                <QuestionCircleFilledIcon className="size-5 shrink-0" dot="#000" mark="#a0e1e1" />
                <p className="text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-black">
                  You can manage password in the kids setting.
                </p>
              </div>
              <BottomButton
                onClick={() => {
                  // The parent home shows this kid's wallet as active (sample data only)
                  try {
                    const done: string[] = JSON.parse(sessionStorage.getItem("pudding-activated") ?? "[]");
                    if (!done.includes(name)) done.push(name);
                    sessionStorage.setItem("pudding-activated", JSON.stringify(done));
                  } catch {}
                  router.push("/family");
                }}
              >
                Done
              </BottomButton>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    );
  }

  if (step === "pin") {
    return (
      <main className="flex min-h-dvh flex-col bg-white">
        <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col pt-[max(16px,env(safe-area-inset-top))]">
          {header()}
          <h1 className="font-display px-4 pb-8 pt-6 text-[32px] font-bold leading-10 tracking-[-0.64px] text-black">
            Enter PIN to activate {name}’s wallet.
          </h1>
          <div className="flex flex-1 items-start justify-center gap-6 px-4 py-10">
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <span
                key={i}
                className={`size-6 rounded-full border border-solid ${
                  i < pin.length ? "border-[#e8e8e8] bg-black" : "border-[#a6a6a6]"
                }`}
              />
            ))}
          </div>
          <Keypad onKey={onKey} />
          <div className="px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
            <BottomButton disabled={pin.length < PIN_LENGTH} onClick={() => setStep("creds")}>
              Next
            </BottomButton>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto w-full max-w-[520px] pb-[140px]">
        <ScrollHeader
          title={`${name}’s spending limits and controls`}
          left={
            <IconButton label="Back" onClick={() => router.push("/family")}>
              <ChevronLeftIcon className="size-6" />
            </IconButton>
          }
          right={
            <HelpLink aria-label="Help" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]">
              <QuestionCircleIcon className="size-6" />
            </HelpLink>
          }
        />
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-7">
            <h2 className="px-4 text-[20px] font-semibold leading-7 tracking-[-0.15px] text-black">{name}’s spending limit</h2>
            <div className="flex flex-col gap-[30px]">
              <MoneyField
                label="Weekly spending"
                hint="The most can spend in a week. It resets every Monday."
                value={weekly}
                onChange={setWeekly}
              />
              <MoneyField
                label="Single purchase"
                hint={`The most ${name} can spend on one purchase, even if there’s still room in the weekly limit.`}
                value={single}
                onChange={setSingle}
              />
            </div>
          </div>
          <div className="flex flex-col gap-7">
            <h2 className="px-4 text-[20px] font-semibold leading-7 tracking-[-0.15px] text-black">{name}’s wallet control</h2>
            <div className="flex flex-col px-4">
              <Row title="In-store" text="e.g grocery, toy etc" on={instore} onChange={setInstore} />
              <Row title="Online" text="e.g Amazon, e-bay etc" on={online} onChange={setOnline} />
              <Row
                title="Age-restricted merchant block"
                text={
                  <>
                    Blocks some merchants that sell age- restricted items.{" "}
                    <span className="font-medium text-[#276ef1]">Learn more</span>
                  </>
                }
                on={ageBlock}
                onChange={setAgeBlock}
                last
              />
            </div>
          </div>
        </div>
      </div>
      <div className={`fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[520px] bg-gradient-to-t from-white from-70% to-white/0 px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-6 transition-opacity duration-150 ${typing ? "pointer-events-none opacity-0" : ""}`}>
        <BottomButton onClick={() => setStep("pin")}>Continue</BottomButton>
      </div>
    </main>
  );
}
