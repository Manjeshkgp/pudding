"use client";

import { useEffect, useState, type RefObject } from "react";

// Tells whether the phone keyboard is open while the given input is focused,
// and how far a bottom bar must be lifted to sit right on top of it.
export function useKeyboard(inputRef: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    type VirtualKeyboard = EventTarget & {
      overlaysContent: boolean;
      boundingRect: DOMRectReadOnly;
    };
    const vk = (navigator as Navigator & { virtualKeyboard?: VirtualKeyboard })
      .virtualKeyboard;

    // Let interactive-widget=resizes-content resize the layout on Chromium.
    // On browsers that only resize the visual viewport, lift the bar by
    // the portion that still overlaps the layout viewport.
    const vv = window.visualViewport;
    let base = window.innerHeight;
    let width = window.innerWidth;
    function update() {
      const height = window.innerHeight;
      const visibleHeight = vv?.scale === 1 ? vv.height : height;
      const visibleTop = vv?.scale === 1 ? vv.offsetTop : 0;
      const viewportInset = Math.max(0, height - visibleHeight - visibleTop);
      const overlayInset =
        vk?.overlaysContent && vk.boundingRect.height > 0
          ? Math.max(0, height - vk.boundingRect.top)
          : 0;
      const typing = Boolean(inputRef.current && document.activeElement === inputRef.current);
      const inset = Math.max(viewportInset, overlayInset);
      if (width !== window.innerWidth || (!typing && inset === 0)) {
        width = window.innerWidth;
        base = height;
      }
      const keyboardOpen = typing && (base - visibleHeight > 100 || inset > 100);
      setOpen(keyboardOpen);
      setOffset(keyboardOpen ? Math.round(inset) : 0);
    }
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    vk?.addEventListener("geometrychange", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      vk?.removeEventListener("geometrychange", update);
      window.removeEventListener("resize", update);
    };
  }, [inputRef]);

  return { open, offset };
}
