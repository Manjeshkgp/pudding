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
      boundingRect: { height: number };
    };
    const vk = (navigator as Navigator & { virtualKeyboard?: VirtualKeyboard })
      .virtualKeyboard;

    if (vk) {
      const previous = vk.overlaysContent;
      vk.overlaysContent = true;
      const update = () => {
        const h = Math.round(vk.boundingRect.height);
        setOpen(h > 0);
        setOffset(h);
      };
      vk.addEventListener("geometrychange", update);
      update();
      return () => {
        vk.removeEventListener("geometrychange", update);
        vk.overlaysContent = previous;
      };
    }

    const vv = window.visualViewport;
    if (!vv) return;
    let base = window.innerHeight;
    function update() {
      if (!vv) return;
      const typing = document.activeElement === inputRef.current;
      if (!typing) base = window.innerHeight;
      setOpen(typing && base - vv.height > 100);
      setOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    }
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [inputRef]);

  return { open, offset };
}
