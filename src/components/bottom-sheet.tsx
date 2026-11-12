import type { ReactNode } from "react";

// White card pinned to the bottom of a phone screen.
// Same 8px gap on both sides; the lower curve follows the phone's width
// and the gap underneath grows with the home-bar safe area.
export default function BottomSheet({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-x-0 bottom-0 px-2 pb-[max(8px,env(safe-area-inset-bottom))]">
      <div className="flex w-full flex-col justify-center rounded-t-[32px] rounded-b-[clamp(32px,14vw,60px)] bg-white px-4 py-8 drop-shadow-[0px_2px_17.2px_rgba(0,0,0,0.16)]">
        {children}
      </div>
    </div>
  );
}
