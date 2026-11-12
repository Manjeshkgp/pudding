"use client";

import dynamic from "next/dynamic";
import animationData from "../../public/lottie/crying-cat.json";

const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), {
  ssr: false,
});

export default function CryingCat() {
  return (
    <div className="relative size-[min(400px,60vw,45dvh)] shrink-0" aria-hidden="true">
      <Lottie
        src={animationData}
        loop
        autoplay
        className="absolute inset-0 size-full"
      />
    </div>
  );
}
