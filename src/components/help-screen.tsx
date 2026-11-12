"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CardIcon,
  ChevronRightIcon,
  FileIcon,
  GearIcon,
  RefreshIcon,
  ShieldIcon,
  UserIcon,
} from "@/components/icons";
import ScrollHeader from "@/components/scroll-header";
import LogoutSheet from "@/components/logout-sheet";
import HelpClose from "@/components/help-close";
import { TOPICS } from "@/components/help-content";

// Help & Support: "Browse your topics". Sample data only.
const icons = [UserIcon, CardIcon, FileIcon, RefreshIcon, ShieldIcon, GearIcon];

export default function HelpScreen({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [logout, setLogout] = useState(false);
  return (
    <main className="min-h-dvh bg-white">
      <ScrollHeader
        title="Help & Support"
        left={<HelpClose fallback={signedIn ? "/account" : "/start"} />}
        right={
          signedIn ? (
            <button
              type="button"
              onClick={() => setLogout(true)}
              className="rounded-full bg-[#fff0ee] px-4 py-3 text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-[#de1135] transition-colors active:bg-[#ffe3df]"
            >
              Logout
            </button>
          ) : undefined
        }
      />

      <nav aria-label="Help resources" className="flex flex-wrap gap-x-5 gap-y-3 px-4 pb-7 text-[15px] underline">
        <Link href="/help/faq">FAQs</Link>
        <Link href="/legal/privacy?returnTo=/help">Privacy Policy</Link>
        <Link href="/legal/terms?returnTo=/help">User Agreement</Link>
      </nav>

      <h2 className="px-4 pb-7 text-xl font-semibold leading-7 tracking-[-0.15px] text-black">
        Browse your topics
      </h2>

      <div className="flex flex-col gap-3 px-4 pb-10">
        {TOPICS.map((t, i) => {
          const Icon = icons[i];
          return (
          <button
            key={t.slug}
            type="button"
            onClick={() => router.push(`/help/${t.slug}`)}
            className="flex h-16 w-full items-center gap-3 rounded-2xl border border-[#e8e8e8] p-5 text-left transition-colors active:bg-[#f3f3f3]"
          >
            <Icon className="size-6 shrink-0 text-black" />
            <span className="min-w-0 flex-1 text-[17px] leading-[25px] tracking-[-0.17px] text-black">
              {t.title}
            </span>
            <ChevronRightIcon className="size-5 shrink-0 text-[#5e5e5e]" />
          </button>
          );
        })}
      </div>
      {signedIn && <LogoutSheet open={logout} onClose={() => setLogout(false)} />}
    </main>
  );
}
