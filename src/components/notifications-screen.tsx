"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { ChevronRightIcon } from "@/components/icons";

const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), {
  ssr: false,
});

// Lock screen with the sample payment notification, exported from Figma
const PHONE = "/images/notifications/phone.svg";
const CAT = "/lottie/notifications-cat.json";

export default function NotificationsScreen() {
  const reduceMotion = useReducedMotion();
  const router = useRouter();

  // Opens the browser's own "allow notifications" prompt, then moves on
  // whatever the answer is.
  async function enable() {
    try {
      if (typeof Notification !== "undefined") {
        await Notification.requestPermission();
      }
    } catch {
      // Some browsers block the prompt; carry on anyway.
    }
    router.push("/security");
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-white">
      <div className="flex shrink-0 items-center justify-end px-4 pt-[max(20px,env(safe-area-inset-top))]">
        <Link
          href="/security"
          className="flex h-11 items-center justify-center rounded-full bg-white px-5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
        >
          Skip
        </Link>
      </div>

      <div className="flex shrink-0 flex-col gap-2 px-4 pb-8 pt-6 text-black">
        <h1 className="font-display text-[32px] font-bold leading-10 tracking-[-0.64px]">
          Busy parent?
          <br />
          We’ve got your back!
        </h1>
        <p className="text-[17px] leading-[25px] tracking-[-0.17px]">
          We’ll send you timely reminders and personalised updates so nothing
          slips through the cracks.
        </p>
      </div>

      {/* Phone sits under the bottom bar, so only its top part shows */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="relative mx-auto mt-3.5 h-[536px] w-[329px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={PHONE}
            alt=""
            className="pointer-events-none absolute inset-0 size-full max-w-none"
          />
          <div
            className="pointer-events-none absolute left-[32.5px] top-[242.5px] size-[276px]"
            aria-hidden="true"
          >
            <Lottie
              src={CAT}
              loop
              autoplay={!reduceMotion}
              className="size-full"
            />
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 bg-white px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-10">
        <button
          type="button"
          onClick={enable}
          className="relative flex h-[52px] w-full items-center justify-center rounded-full bg-black px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-white"
        >
          Enable notifications
          <ChevronRightIcon className="absolute right-5 top-1/2 size-6 -translate-y-1/2 text-white" />
        </button>
      </div>
    </main>
  );
}
