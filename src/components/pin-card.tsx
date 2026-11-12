"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

// A white card that pins near the top of the screen while the page scrolls,
// shrinks to a short bar and lets its content slide up underneath its label
// (Figma kid home and earn frames).
//
// The motion runs on the browser's scroll timeline (see .kh-* in globals.css)
// so it stays smooth. Browsers without it use the script version below.
export default function PinCard({
  top,
  height,
  label,
  labelHeight,
  barHeight,
  pinnedHeight = 144,
  pinTop = 20,
  children,
}: {
  /** Where the card starts on the page, in px from the top of the page */
  top: number;
  /** Full height of the card, in px */
  height: number;
  /** Always visible label at the top of the card */
  label: React.ReactNode;
  /** Height of the label's text, in px */
  labelHeight: number;
  /** Set when the label bar should keep one fixed height (instead of growing while it scrolls) */
  barHeight?: number;
  /** Height of the card once it is pinned */
  pinnedHeight?: number;
  /** Where the card stops, in px from the top of the screen */
  pinTop?: number;
  /** The card's content. Start it with a hidden copy of the label so it keeps its space. */
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(typeof CSS !== "undefined" && CSS.supports("animation-timeline: scroll()"));
  }, []);

  const start = top - pinTop;
  const shrink = height - pinnedHeight;
  const barStart = barHeight ?? 24 + labelHeight;
  const barEnd = barHeight ?? barStart + 22.6;

  const { scrollY } = useScroll();
  const pinY = useTransform(scrollY, (v) => Math.max(v - start, 0));
  const cardH = useTransform(pinY, (v) => height - Math.min(v, shrink));
  const contentY = useTransform(pinY, (v) => -Math.min(v, shrink));
  const barH = useTransform(pinY, (v) => barStart + (barEnd - barStart) * (Math.min(v, shrink) / shrink));

  const js = !reduceMotion && !native;
  const css = !reduceMotion && native;

  return (
    <div
      className="relative z-20"
      style={
        {
          height,
          "--kh-start": `${start}px`,
          "--kh-shrink": `${shrink}px`,
          "--kh-bar-start": `${barStart}px`,
          "--kh-bar-end": `${barEnd}px`,
        } as React.CSSProperties
      }
    >
      <motion.div
        style={js ? { y: pinY } : undefined}
        className={`drop-shadow-[0px_2px_10px_rgba(0,0,0,0.1)] ${css ? "kh-pin" : ""}`}
      >
        <motion.section
          style={js ? { height: cardH } : undefined}
          className={`relative overflow-hidden rounded-[32px] bg-white ${css ? "kh-clip" : ""}`}
        >
          <motion.div
            style={js ? { y: contentY } : undefined}
            className={`flex flex-col gap-5 px-5 py-6 ${css ? "kh-content" : ""}`}
          >
            {children}
          </motion.div>
          <motion.div
            style={js ? { height: barH } : undefined}
            className={`absolute inset-x-0 top-0 bg-white px-5 pt-6 ${css ? "kh-bar" : ""}`}
          >
            {label}
          </motion.div>
        </motion.section>
      </motion.div>
    </div>
  );
}
