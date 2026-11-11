"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ScrollHeader from "@/components/scroll-header";
import { AVATARS } from "@/components/avatar-sheet";
import { BackPill, EmptyState, InvitationsPill, readInvites, type Invite } from "@/components/coparent-parts";

// Parent flow: co-parent home. Empty until an invite has been sent in the invite screen.
export default function CoparentScreen() {
  const router = useRouter();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  useEffect(() => setInvites(readInvites()), []);

  if (invites === null) return <main className="min-h-dvh bg-white" />;

  if (invites.length === 0) {
    return (
      <main className="min-h-dvh bg-white">
        <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col pt-[max(16px,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between px-4">
            <BackPill />
            <InvitationsPill />
          </div>
          <EmptyState text="No co-parent here" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto w-full max-w-[520px] pb-[190px]">
        <ScrollHeader title="Co-parent" left={<BackPill />} right={<InvitationsPill />} />
        <div className="flex flex-col gap-4 px-4">
          {invites.map((inv, i) => (
            <div
              key={`${inv.email}-${i}`}
              className="flex h-[100px] items-center gap-3 rounded-3xl border border-[#e8e8e8] px-5 py-3.5"
            >
              <div className="relative size-[52px] shrink-0 overflow-hidden rounded-full bg-[#ffc091]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={AVATARS[0].src}
                  alt=""
                  className="absolute left-[-3.21px] top-[6.43px] size-[63.778px] max-w-none"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black">
                  {inv.email}
                </p>
                <p className="text-[15px] leading-[22px] tracking-[-0.15px] text-[#4b4b4b]">Invite sent</p>
              </div>
              <p className="shrink-0 text-[15px] leading-[22px] tracking-[-0.15px] text-[#4b4b4b]">{inv.date}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-[520px] flex-col gap-2.5 bg-gradient-to-t from-white from-70% to-white/0 px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-6">
        <button
          type="button"
          onClick={() => router.push("/coparent/add")}
          className="flex h-[52px] w-full items-center justify-center rounded-full bg-[#e8e8e8] px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black"
        >
          Add more
        </button>
        <button
          type="button"
          className="flex h-[52px] w-full items-center justify-center rounded-full bg-black px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-white"
        >
          Edit
        </button>
      </div>
    </main>
  );
}
