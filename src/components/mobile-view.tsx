"use client";

import { useSyncExternalStore } from "react";
import MobileOnly from "@/components/mobile-only";

const touchPointer = "(pointer: coarse)";

function subscribe(onChange: () => void) {
  const pointer = window.matchMedia(touchPointer);
  pointer.addEventListener("change", onChange);
  window.addEventListener("resize", onChange);
  window.addEventListener("pageshow", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    pointer.removeEventListener("change", onChange);
    window.removeEventListener("resize", onChange);
    window.removeEventListener("pageshow", onChange);
    window.removeEventListener("focus", onChange);
  };
}

function isPhoneView() {
  // Use the screen's shorter side so rotation and the keyboard do not
  // change whether a phone can use the app.
  return (
    window.matchMedia(touchPointer).matches &&
    Math.min(window.screen.width, window.screen.height) <= 600
  );
}

export default function MobileView({
  initialPhone,
  children,
}: {
  initialPhone: boolean;
  children: React.ReactNode;
}) {
  const showApp = useSyncExternalStore(subscribe, isPhoneView, () => initialPhone);
  return showApp ? children : <MobileOnly />;
}
