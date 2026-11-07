"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import animationData from "../../public/lottie/crying-cat.json";

const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), {
  ssr: false,
});

// Only starts playing on desktop and tablet, where the "mobile only" screen shows.
export default function CryingCat() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(
      "(min-width: 768px) and (min-height: 600px)",
    );
    const update = () => setShow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <div className="relative size-[400px] shrink-0" aria-hidden="true">
      {show && (
        <Lottie
          src={animationData}
          loop
          autoplay
          className="absolute inset-0 size-full"
        />
      )}
    </div>
  );
}
