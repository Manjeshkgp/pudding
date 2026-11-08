"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ScrollHeader from "@/components/scroll-header";
import LogoutSheet from "@/components/logout-sheet";
import {
  CardIcon,
  ChevronRightIcon,
  CloseIcon,
  HeartIcon,
  PowerIcon,
  QuestionCircleIcon,
  SearchIcon,
  ShieldIcon,
  SlidersIcon,
  UploadIcon,
  UserIcon,
} from "@/components/icons";
import { AVATARS } from "@/components/avatar-sheet";

// Accounts screen, opened from the round profile picture at the top right.
// Sample data only: nothing here is loaded or saved.
const NAME = "Bob - The builder";
const KIDS = 2;

type Row = {
  label: string;
  href?: string;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
};

const icon = "size-6 shrink-0 text-black";

const manage: Row[] = [
  { label: "Mange kids", icon: <UserIcon className={icon} />, trailing: (
      <span className="flex items-center gap-1">
        <span className="text-[17px] leading-[25px] tracking-[-0.17px]">{KIDS}</span>
        <ChevronRightIcon className={icon} />
      </span>
    ),
  },
  { label: "Preferences", icon: <SlidersIcon className={icon} /> },
  { label: "Security & Privacy", icon: <ShieldIcon className={icon} /> },
];

const more: Row[] = [
  { label: "Help & Support", href: "/help", icon: <QuestionCircleIcon className={icon} /> },
  { label: "Invite your friends", icon: <HeartIcon className={icon} />, trailing: <UploadIcon className={icon} /> },
  { label: "About Pudding", icon: <CardIcon className={icon} /> },
];

function Group({ rows }: { rows: Row[] }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-1 overflow-hidden rounded-3xl">
      {rows.map((r) => (
        <button
          key={r.label}
          type="button"
          onClick={
            r.href
              ? () => {
                  try {
                    sessionStorage.setItem("pudding-help-origin", "/account");
                  } catch {}
                  router.push(r.href!);
                }
              : undefined
          }
          className="flex w-full items-center gap-3 bg-[#f3f3f3] px-5 py-[18px] text-left transition-colors active:bg-[#e8e8e8]"
        >
          {r.icon}
          <span className="min-w-0 flex-1 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black">
            {r.label}
          </span>
          {r.trailing ?? <ChevronRightIcon className={icon} />}
        </button>
      ))}
    </div>
  );
}

export default function AccountScreen() {
  const router = useRouter();
  const [avatar, setAvatar] = useState(0);
  const [logout, setLogout] = useState(false);

  // The picture picked on the profile screen
  useEffect(() => {
    try {
      const i = Number(sessionStorage.getItem("pudding-avatar"));
      if (Number.isInteger(i) && AVATARS[i]) setAvatar(i);
    } catch {}
  }, []);

  return (
    <main className="min-h-dvh bg-white">
      <ScrollHeader
        title="Accounts"
        left={
          <button
            type="button"
            aria-label="Close"
            onClick={() => router.back()}
            className="flex size-11 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
          >
            <CloseIcon className="size-6 text-black" />
          </button>
        }
      />

      <div className="flex flex-col gap-6 px-4 pb-10">
        <label className="flex h-14 items-center gap-3 rounded-full bg-[#f3f3f3] px-5 py-3.5">
          <SearchIcon className="size-6 shrink-0 text-[#a6a6a6]" />
          <input
            type="search"
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-[17px] leading-[25px] tracking-[-0.17px] text-black outline-none placeholder:text-[#a6a6a6]"
          />
        </label>

        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-3xl bg-[#f3f3f3] px-5 py-4 text-left transition-colors active:bg-[#e8e8e8]"
            >
              <span
                className="size-12 shrink-0 overflow-hidden rounded-full"
                style={{ backgroundColor: AVATARS[avatar].bg }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={AVATARS[avatar].src} alt="" className="size-full" />
              </span>
              <span className="min-w-0 flex-1 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black">
                {NAME}
              </span>
              <ChevronRightIcon className={icon} />
            </button>
            <Group rows={manage} />
          </div>
          <Group rows={more} />
          {/* Logout goes back to the first screen */}
          <button
            type="button"
            onClick={() => setLogout(true)}
            className="flex w-full items-center gap-3 rounded-3xl bg-[#fff0ee] px-5 py-[18px] text-left text-[#de1135] transition-colors active:bg-[#ffe3df]"
          >
            <PowerIcon className="size-6 shrink-0" />
            <span className="min-w-0 flex-1 text-[17px] font-medium leading-[22px] tracking-[-0.17px]">
              Logout
            </span>
            <ChevronRightIcon className="size-6 shrink-0" />
          </button>
        </div>
      </div>
      <LogoutSheet open={logout} onClose={() => setLogout(false)} />
    </main>
  );
}
