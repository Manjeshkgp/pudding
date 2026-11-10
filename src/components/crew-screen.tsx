"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { AVATARS } from "@/components/avatar-sheet";
import { getApi } from "@/lib/client-api";

type ChildSummary = {
  id: string;
  name: string;
  age: number;
  avatar: string;
};

export default function CrewScreen() {
  const [me, setMe] = useState(0);
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [error, setError] = useState("");

  // The picture picked on the profile screen
  useEffect(() => {
    try {
      const saved = Number(sessionStorage.getItem("pudding-avatar"));
      if (Number.isInteger(saved) && saved >= 0 && saved < AVATARS.length) setMe(saved);
    } catch {}
  }, []);

  useEffect(() => {
    let active = true;
    getApi<{ children: ChildSummary[] }>("/api/children")
      .then((result) => {
        if (active) setChildren(result.children);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load children.");
      });
    return () => {
      active = false;
    };
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
        {error && <li role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</li>}
        {children.map((kid) => {
          const avatarIndex = Number(kid.avatar.replace("avatar-", "")) - 1;
          const safeAvatar = Number.isInteger(avatarIndex) && avatarIndex >= 0 && avatarIndex < AVATARS.length ? avatarIndex : 0;
          return (
          <li
            key={kid.id}
            className="flex items-center gap-3 rounded-3xl border border-[#e8e8e8] px-5 py-3.5"
          >
            <span
              className="size-[52px] shrink-0 overflow-hidden rounded-full"
              style={{ backgroundColor: AVATARS[safeAvatar].bg }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={AVATARS[safeAvatar].src} alt="" className="size-full" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black">
                {kid.name}
              </span>
              <span className="text-[15px] leading-[22px] tracking-[-0.15px] text-[#4b4b4b]">
                {kid.age} years
              </span>
            </span>
            <Link
              href={`/crew/${kid.id}`}
              className="rounded-full bg-[#f3f3f3] px-4 py-3 text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-black transition-colors active:bg-[#e8e8e8]"
            >
              Edit
            </Link>
          </li>
          );
        })}
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
