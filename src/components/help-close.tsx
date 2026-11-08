"use client";

import { useRouter } from "next/navigation";
import { CloseIcon } from "@/components/icons";

// Round white X at the top left of the help screens. Goes back to wherever
// the person came from.
export default function HelpClose({ fallback = "/account" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Close"
      onClick={() => {
        // Close the whole help section, back to the screen it was opened from
        let origin = fallback;
        try {
          origin = sessionStorage.getItem("pudding-help-origin") || fallback;
        } catch {}
        router.push(origin);
      }}
      className="flex size-11 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
    >
      <CloseIcon className="size-6 text-black" />
    </button>
  );
}
