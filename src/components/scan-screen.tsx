"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon } from "@/components/icons";

// Kid flow: Pay with QR. The camera view is a stand-in (no camera is opened and nothing is scanned).
// The permission sheet shows the first time only.
const SEEN_KEY = "pudding-scan-permission-seen";
const EASE = [0.22, 1, 0.36, 1] as const;

// Torch icon, exported from Figma (material-symbols-light:flashlight-on)
function FlashlightIcon() {
  return (
    <svg viewBox="0 0 35 35" className="size-[35px]" fill="none" aria-hidden="true">
      <path
        d="M10.1816 7.99964V4.36328H24.7271V7.99964H10.1816ZM18.4827 21.3946C18.7669 21.1124 18.9089 20.7696 18.9089 20.3662C18.9089 19.9628 18.7678 19.619 18.4856 19.3349C18.2035 19.0508 17.8607 18.9087 17.4573 18.9087C17.0539 18.9087 16.7101 19.0498 16.426 19.332C16.1419 19.6142 15.9998 19.957 15.9998 20.3604C15.9998 20.7638 16.1409 21.1075 16.4231 21.3916C16.7053 21.6758 17.0481 21.8178 17.4515 21.8178C17.8549 21.8178 18.1986 21.6767 18.4827 21.3946ZM13.0907 30.5451V15.5516L10.1816 11.188V9.45419H24.7271V11.188L21.818 15.5516V30.5451H13.0907Z"
        fill="#fff"
      />
    </svg>
  );
}

// Four white corner brackets around the scan area
function ScanFrame({ live }: { live: boolean }) {
  const arm = 52;
  const r = 32;
  const size = 280;
  const e = size - 1;
  return (
    <div className="relative size-[280px]" aria-hidden="true">
      <div
        className={`absolute inset-0 rounded-[32px] ${
          live ? "shadow-[0_0_0_100vmax_rgba(0,0,0,0.55)]" : "bg-white/20"
        }`}
      />
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 size-full" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
        <path d={`M1 ${arm}V${r + 1}A${r} ${r} 0 0 1 ${r + 1} 1H${arm}`} />
        <path d={`M${e - arm + 1} 1H${e - r}A${r} ${r} 0 0 1 ${e} ${r + 1}V${arm}`} />
        <path d={`M1 ${e - arm + 1}V${e - r}A${r} ${r} 0 0 0 ${r + 1} ${e}H${arm}`} />
        <path d={`M${e - arm + 1} ${e}H${e - r}A${r} ${r} 0 0 0 ${e} ${e - r}V${e - arm + 1}`} />
      </svg>
    </div>
  );
}

function PermissionSheet({ onAllow }: { onAllow: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex justify-center bg-black/60"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div role="dialog" aria-label="Camera access" className="relative w-full max-w-[520px]">
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ duration: 0.45, ease: EASE }}
          className="absolute inset-x-0 bottom-0 px-2 pb-[max(8px,env(safe-area-inset-bottom))]"
        >
          <div className="flex w-full flex-col items-center gap-8 rounded-t-[32px] rounded-b-[clamp(32px,14vw,60px)] bg-white px-4 pb-8 pt-1 drop-shadow-[0px_2px_17.2px_rgba(0,0,0,0.16)]">
            <div className="flex w-full flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/scan-cat.svg"
                alt=""
                className="size-[230px] object-contain"
                onError={(e) => (e.currentTarget.style.visibility = "hidden")}
              />
              <div className="flex w-full flex-col gap-4 text-center text-black">
                <h2 className="font-display text-[32px] font-bold leading-10 tracking-[-0.64px]">
                  Pudding can scan any QR to pay
                </h2>
                <p className="text-[17px] leading-[25px] tracking-[-0.17px]">
                  Point your camera at a shop’s QR code. Your purchase request goes to you for approval before
                  anything is charged.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onAllow}
              className="flex h-[52px] w-full items-center justify-center rounded-full bg-black px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-white"
            >
              Allow camera access
            </button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

export default function ScanScreen() {
  const router = useRouter();
  const [showSheet, setShowSheet] = useState(false);
  const [torch, setTorch] = useState(false);
  const [live, setLive] = useState(false);
  const [cameraNote, setCameraNote] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Opens the phone's back camera in the browser. Needs https (or localhost) and the person's OK.
  const startCamera = useCallback(async () => {
    if (streamRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraNote("The camera only works on a secure (https) address.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setLive(true);
      setCameraNote("");
    } catch {
      setCameraNote("Camera access is blocked. Allow it in your browser settings.");
    }
  }, []);

  useEffect(() => {
    let seen = false;
    try {
      seen = !!localStorage.getItem(SEEN_KEY);
    } catch {}
    if (seen) startCamera();
    else setShowSheet(true);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [startCamera]);

  function allow() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    setShowSheet(false);
    startCamera();
  }

  async function toggleTorch() {
    const next = !torch;
    setTorch(next);
    const track = streamRef.current?.getVideoTracks()[0];
    try {
      await track?.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
    } catch {}
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#606060]">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-hidden="true"
        className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${live ? "opacity-100" : "opacity-0"}`}
      />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[520px] flex-col pt-[max(16px,env(safe-area-inset-top))]">
        <div className="relative z-10 px-4">
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.back()}
            className="flex size-11 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
          >
            <ChevronLeftIcon className="size-6" />
          </button>
        </div>
        <h1 className="relative z-10 px-4 pb-8 pt-6 font-display text-[32px] font-bold leading-10 tracking-[-0.64px] text-white">
          Pay with QR
        </h1>
        <div className="flex flex-1 items-center justify-center">
          <ScanFrame live={live} />
        </div>
        {cameraNote && (
          <p className="relative z-10 px-8 text-center text-[15px] leading-[22px] tracking-[-0.15px] text-white/80">{cameraNote}</p>
        )}
        <div className="relative z-10 flex items-center justify-center pb-[max(97px,calc(env(safe-area-inset-bottom)+48px))] pt-8">
          <button
            type="button"
            aria-label="Flashlight"
            aria-pressed={torch}
            onClick={toggleTorch}
            className={`flex size-16 items-center justify-center rounded-full transition-colors ${
              torch ? "bg-white/40" : "bg-white/20"
            }`}
          >
            <FlashlightIcon />
          </button>
        </div>
      </div>
      <AnimatePresence>{showSheet && <PermissionSheet onAllow={allow} />}</AnimatePresence>
    </main>
  );
}
