"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useMotionTemplate, useMotionValue } from "framer-motion";
import type { AnimationPlaybackControls } from "framer-motion";

// The "Top up" pill. Its gradient border slowly drifts on its own, and
// follows your finger or cursor while you are over it.
export default function TopupPill({
  onLaunch,
}: {
  onLaunch: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const angle = useMotionValue(135);
  const drift = useRef<AnimationPlaybackControls | null>(null);

  function startDrift() {
    drift.current?.stop();
    drift.current = animate(angle, angle.get() + 360, {
      duration: 7,
      ease: "linear",
      repeat: Infinity,
    });
  }

  useEffect(() => {
    startDrift();
    return () => drift.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function follow(e: React.PointerEvent<HTMLAnchorElement>) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    drift.current?.stop();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    // CSS conic angle: 0deg points up, clockwise
    const target = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const cur = angle.get();
    let delta = (((target - cur) % 360) + 540) % 360 - 180;
    animate(angle, cur + delta, { duration: 0.18, ease: "easeOut" });
  }

  const background = useMotionTemplate`linear-gradient(#260a2f,#260a2f) padding-box, conic-gradient(from ${angle}deg, #d9d9d9, #7a5a88 25%, #ffffff 50%, #7a5a88 75%, #d9d9d9) border-box`;

  return (
    <motion.a
      ref={ref}
      href="/topup"
      onClick={onLaunch}
      onPointerEnter={follow}
      onPointerMove={follow}
      onPointerDown={follow}
      onPointerLeave={startDrift}
      onPointerCancel={startDrift}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="pointer-events-auto flex items-center justify-center rounded-full border-[2.5px] border-transparent px-5 py-3 font-display text-[20px] font-bold leading-7 tracking-[-0.15px] text-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.2)]"
      style={{ background }}
    >
      Top up
    </motion.a>
  );
}
