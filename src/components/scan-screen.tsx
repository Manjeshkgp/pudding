"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import BackButton from "@/components/back-button";
import { AppScreen, Button, useAction } from "@/components/app-ui";
import { PurchaseScreen } from "@/components/purchase-screens";
import { type Purchase } from "@/lib/app-types";
import { postApi } from "@/lib/client-api";

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
                  Scan & pay with Pudding
                </h2>
                <p className="text-[17px] leading-[25px] tracking-[-0.17px]">
                  Point your camera at a bill and tap Scan bill. Review the
                  sample items and total before you request payment.
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

function ScanCamera({
  onScan,
  scanning,
  scanError,
}: {
  onScan: () => void;
  scanning: boolean;
  scanError: string;
}) {
  const [hasSeenPermission, setHasSeenPermission] = useState<boolean | null>(null);
  const [torch, setTorch] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [live, setLive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    try {
      setHasSeenPermission(localStorage.getItem(SEEN_KEY) === "1");
    } catch {
      setHasSeenPermission(false);
    }
  }, []);

  useEffect(() => {
    if (!hasSeenPermission) return;
    const video = videoRef.current;
    if (!video) return;
    setLive(false);
    setTorch(false);
    setTorchAvailable(false);
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Open Pudding on HTTPS or localhost to use your camera.");
      return;
    }
    let active = true;
    void navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    }).then((stream) => {
      if (!active) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      video.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.() as
        | (MediaTrackCapabilities & { torch?: boolean })
        | undefined;
      setTorchAvailable(capabilities?.torch === true);
    }).catch(() => {
      if (active) setCameraError("Camera access is unavailable. Check your browser permissions and retry.");
    });
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      video.srcObject = null;
    };
  }, [hasSeenPermission, attempt]);

  function allow() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    setHasSeenPermission(true);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch(next);
    } catch {
      setTorchAvailable(false);
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#606060]">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        onPlaying={() => setLive(true)}
        aria-hidden="true"
        className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${live ? "opacity-100" : "opacity-0"}`}
      />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[520px] flex-col pt-[max(16px,env(safe-area-inset-top))]">
        <div className="relative z-10 px-4">
          <BackButton fallback="/home" />
        </div>
        <h1 className="relative z-10 px-4 pb-8 pt-6 font-display text-[32px] font-bold leading-10 tracking-[-0.64px] text-white">
          Scan a bill
        </h1>
        <div className="flex flex-1 items-center justify-center">
          <ScanFrame live={live} />
        </div>
        <div className="relative z-10 mx-auto flex w-full max-w-sm flex-col items-center gap-3 px-4 pb-[calc(max(56px,env(safe-area-inset-bottom))+88px)] pt-6">
          {(cameraError || scanError) && (
            <p role="alert" className="text-center text-sm text-white">
              {cameraError || scanError}
            </p>
          )}
          <div className="flex w-full items-center gap-3">
            {cameraError ? (
              <Button secondary className="flex-1" onClick={() => setAttempt((value) => value + 1)}>
                Retry camera
              </Button>
            ) : (
              <Button
                secondary
                className="flex-1"
                busy={scanning}
                disabled={!live}
                onClick={() => {
                  if (videoRef.current?.videoWidth) onScan();
                }}
              >
                Scan bill
              </Button>
            )}
            {torchAvailable && live && (
              <button
                type="button"
                aria-label="Flashlight"
                aria-pressed={torch}
                onClick={toggleTorch}
                className={`flex size-12 shrink-0 items-center justify-center rounded-full transition-colors ${torch ? "bg-white/40" : "bg-white/20"}`}
              >
                <FlashlightIcon />
              </button>
            )}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {hasSeenPermission === false && <PermissionSheet onAllow={allow} />}
      </AnimatePresence>
    </main>
  );
}

export default function ScanScreen() {
  const action = useAction();
  const requestKey = useRef<string | null>(null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [purchaseBusy, setPurchaseBusy] = useState(false);

  useEffect(() => {
    if (purchase) window.scrollTo({ top: 0, behavior: "auto" });
  }, [purchase]);

  function scan() {
    void action.run(async () => {
      requestKey.current ||= crypto.randomUUID();
      const result = await postApi<{ purchase: Purchase }>("/api/purchases", {
        idempotencyKey: requestKey.current,
      });
      setPurchase(result.purchase);
    });
  }

  if (!purchase)
    return <ScanCamera onScan={scan} scanning={action.busy} scanError={action.error} />;

  return (
    <AppScreen title="Scanned bill" back="/home" role="CHILD" color="#ffc091">
      <PurchaseScreen
        key={purchase.id}
        id={purchase.id}
        initialPurchase={purchase}
        parent={false}
        embedded
        onBusyChange={setPurchaseBusy}
      />
      <Button
        secondary
        disabled={purchaseBusy}
        onClick={() => {
          requestKey.current = null;
          setPurchase(null);
        }}
      >
        Scan another bill
      </Button>
    </AppScreen>
  );
}
