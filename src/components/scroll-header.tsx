"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Top row stays pinned. The big heading scrolls away and a smaller copy of it
// slides in next to the left button once the big one has left the screen.
export default function ScrollHeader({
  title,
  left,
  right,
}: {
  title: string;
  left: React.ReactNode;
  right?: React.ReactNode;
}) {
  const [small, setSmall] = useState(false);

  useEffect(() => {
    const update = () =>
      setSmall((was) => (was ? window.scrollY > 24 : window.scrollY > 56));
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <>
      <div className="sticky top-0 z-20 bg-white px-4 pb-3 pt-[max(20px,env(safe-area-inset-top))]">
        <div className="relative flex h-11 items-center justify-between">
          {left}
          <AnimatePresence>
            {small && (
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute left-14 top-0 flex h-11 items-center font-display text-xl font-semibold leading-7 tracking-[-0.15px] text-[#222]"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                {title}
              </motion.span>
            )}
          </AnimatePresence>
          {right}
        </div>
      </div>
      <h1 className="px-4 pb-8 pt-3 font-display text-[32px] font-bold leading-[40px] tracking-[-0.64px] text-black">
        {title}
      </h1>
    </>
  );
}
