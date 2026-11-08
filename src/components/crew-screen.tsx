"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { AVATARS } from "@/components/avatar-sheet";
import { KIDS, ageText } from "@/components/crew-data";

// Review list shown after Continue on Add kid. Sample data only.

export default function CrewScreen() {
  const [me, setMe] = useState(0);

  // The picture picked on the profile screen
  useEffect(() => {
    try {
      const saved = Number(sessionStorage.getItem("pudding-avatar"));
      if (Number.isInteger(saved) && saved >= 0 && saved < AVATARS.length) setMe(saved);
    } catch {}
  }, []);

  return (
    <main className="min-h-dvh bg-white">
      <div className="px-4 pt-[max(20px,env(safe-area-inset-top))]">
        <div className="flex h-11 items-center justify-between">
          <Link
            href="/add-kid"
            aria-label="Back"
            className="flex size-11 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
          >
            <ChevronLeftIcon className="size-6 text-black" />
          </Link>
          <Link
            href="/account"
            aria-label="Account"
            className="size-11 overflow-hidden rounded-full"
            style={{ backgroundColor: AVATARS[me].bg }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={AVATARS[me].src} alt="" className="size-full" />
          </Link>
        </div>
        <div className="flex flex-col gap-2 pb-8 pt-6">
          <h1 className="font-display text-[32px] font-bold leading-[40px] tracking-[-0.64px] text-black">
            Your little crew
          </h1>
          <p className="text-[17px] leading-[25px] tracking-[-0.17px] text-black">
            Your little ones are all here, review their details.
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-4 px-4 pb-[200px]">
        {KIDS.map((k, i) => (
          <li
            key={k.first}
            className="flex items-center gap-3 rounded-3xl border border-[#e8e8e8] px-5 py-3.5"
          >
            <span
              className="size-[52px] shrink-0 overflow-hidden rounded-full"
              style={{ backgroundColor: AVATARS[k.avatar].bg }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={AVATARS[k.avatar].src} alt="" className="size-full" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black">
                {k.first} {k.last}
              </span>
              <span className="text-[15px] leading-[22px] tracking-[-0.15px] text-[#4b4b4b]">
                {ageText(k.dob)}
              </span>
            </span>
            <Link
              href={`/crew/${i}`}
              className="rounded-full bg-[#f3f3f3] px-4 py-3 text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-black transition-colors active:bg-[#e8e8e8]"
            >
              Edit
            </Link>
          </li>
        ))}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-10 flex flex-col gap-2.5 px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
        <Link
          href="/add-kid"
          className="flex h-[52px] w-full items-center justify-center rounded-full bg-[#e8e8e8] px-5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black transition-colors active:bg-[#dcdcdc]"
        >
          Add another
        </Link>
        <Link
          href="/plan"
          className="flex h-[52px] w-full items-center justify-center rounded-full bg-black px-5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-white"
        >
          Continue
        </Link>
      </div>
    </main>
  );
}
