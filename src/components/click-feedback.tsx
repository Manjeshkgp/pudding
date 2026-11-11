"use client";

import { useEffect } from "react";

// Soft "tick" sound plus a tiny vibration on every tap of a button or link.
// The sound is made in code (no audio file). Vibration works on phones that
// support it (most Android browsers); iPhone Safari does not allow it.
const TAPPABLE =
  'button, a[href], [role="button"], [role="tab"], summary, input[type="checkbox"], input[type="radio"], label[for]';

export default function ClickFeedback() {
  useEffect(() => {
    let ctx: AudioContext | null = null;

    function tick() {
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctx ??= new Ctor();
        if (ctx.state === "suspended") void ctx.resume();

        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(620, t);
        osc.frequency.exponentialRampToValueAtTime(420, t + 0.07);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.035, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.1);
      } catch {}
    }

    function onClick(e: MouseEvent) {
      const el = (e.target as Element | null)?.closest?.(TAPPABLE);
      if (!el) return;
      if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return;
      tick();
      try {
        navigator.vibrate?.(6);
      } catch {}
    }

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      void ctx?.close();
    };
  }, []);

  return null;
}
