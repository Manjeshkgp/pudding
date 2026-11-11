"use client";

import { useRouter } from "next/navigation";
import { ChevronLeftIcon } from "@/components/icons";

// Shared bits of the co-parent flow.
// Invites are kept only in this browser tab (sample data): nothing is sent anywhere.
export type Invite = { email: string; date: string };
const KEY = "pudding-coparent-invites";

export function readInvites(): Invite[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "[]") as Invite[];
  } catch {
    return [];
  }
}

export function saveInvite(email: string) {
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...readInvites(), { email, date }]));
  } catch {}
}

export function BackPill({ to }: { to?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => (to ? router.push(to) : router.back())}
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
    >
      <ChevronLeftIcon className="size-6" />
    </button>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-[52px] w-full items-center justify-center rounded-full px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] transition-colors ${
        disabled ? "bg-[#f3f3f3] text-[#a6a6a6]" : "bg-black text-white"
      }`}
    >
      {children}
    </button>
  );
}

export function InvitationsPill() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push("/coparent/invitations")}
      className="rounded-full bg-[#f3f3f3] px-4 py-3 text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-black"
    >
      Invitations
    </button>
  );
}

// Centered message + black "Add" pill, used by both empty states.
export function EmptyState({ text, wide }: { text: string; wide?: boolean }) {
  const router = useRouter();
  return (
    <div className="flex flex-1 items-center justify-center px-8 pb-24">
      <div className={`flex flex-col items-center gap-[26px] ${wide ? "w-[337px] max-w-full" : ""}`}>
        <p className="text-center font-display text-[24px] font-bold leading-8 tracking-[-0.48px] text-black">
          {text}
        </p>
        <button
          type="button"
          onClick={() => router.push("/coparent/add")}
          className="flex h-12 w-[104px] items-center justify-center rounded-full bg-black px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-white"
        >
          Add
        </button>
      </div>
    </div>
  );
}
