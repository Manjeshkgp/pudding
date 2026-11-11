"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Becomes true after the first screen has loaded, so only moving between
// screens slides in from the right (not the very first load or a refresh).
let hasNavigated = false;

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The top-up screen opens by growing out of the Top up button instead
  const [slide, setSlide] = useState(() => hasNavigated && pathname !== "/topup");
  useEffect(() => {
    hasNavigated = true;
  }, []);

  return (
    <div
      className={slide ? "page-slide-in" : undefined}
      // Back to normal page flow once the slide is done
      onAnimationEnd={() => setSlide(false)}
    >
      {children}
    </div>
  );
}
