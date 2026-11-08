"use client";

import { useEffect, useState } from "react";

// Becomes true after the first screen has loaded, so only moving between
// screens slides in from the right (not the very first load or a refresh).
let hasNavigated = false;

export default function Template({ children }: { children: React.ReactNode }) {
  const [slide, setSlide] = useState(() => hasNavigated);
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
