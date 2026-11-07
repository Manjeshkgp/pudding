"use client";

import { useEffect, useState } from "react";

// On phones wider than the 402px design, scale the room up so it fills the
// whole width instead of leaving a plain strip on each side.
export default function useStageScale(designWidth = 402) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function update() {
      setScale(Math.max(1, window.innerWidth / designWidth));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [designWidth]);

  return scale;
}
