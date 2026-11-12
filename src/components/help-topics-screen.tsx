"use client";

import { useRouter } from "next/navigation";
import { ChevronRightIcon, FileIcon } from "@/components/icons";
import ScrollHeader from "@/components/scroll-header";
import HelpClose from "@/components/help-close";

import type { Topic } from "@/components/help-content";

export default function HelpTopicsScreen({ topic }: { topic: Topic }) {
  const router = useRouter();
  return (
    <main className="min-h-dvh bg-white">
      <ScrollHeader title="Help topics" left={<HelpClose fallback="/help" />} />

      <h2 className="px-4 pb-7 text-xl font-semibold leading-7 tracking-[-0.15px] text-black">
        {topic.title}
      </h2>

      <div className="flex flex-col pb-10">
        {topic.articles.map((a, i) => (
          <button
            key={a.slug}
            type="button"
            onClick={() => router.push(`/help/${topic.slug}/${a.slug}`)}
            className={`flex w-full items-center gap-3 px-5 py-6 text-left transition-colors active:bg-[#f3f3f3] ${
              i < topic.articles.length - 1 ? "border-b border-[#e8e8e8]" : ""
            }`}
          >
            <FileIcon className="size-6 shrink-0 text-black" />
            <span className="min-w-0 flex-1 text-[17px] leading-[25px] tracking-[-0.17px] text-black">
              {a.title}
            </span>
            <ChevronRightIcon className="size-5 shrink-0 text-[#5e5e5e]" />
          </button>
        ))}
      </div>
    </main>
  );
}
