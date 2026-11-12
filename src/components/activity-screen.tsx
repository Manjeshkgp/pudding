"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ActivityRow, { type ActivityItem } from "@/components/activity-row";
import HelpLink from "@/components/help-link";
import ScrollHeader from "@/components/scroll-header";
import { ChevronLeftIcon, QuestionCircleIcon } from "@/components/icons";

// Kid "Activity" screen. Sample data only, nothing is loaded.
const FILTERS = ["All", "Today", "Last week", "Last month"];

const ITEMS: ActivityItem[] = [
  { id: 1, kind: "food", title: "Falafel station", date: "4 July 2026", amount: "$12", balance: "$27.00" },
  { id: 2, kind: "wallet", title: "From Dad", date: "4 July 2026", amount: "+ $12", balance: "$27.00", income: true },
  { id: 3, kind: "shop", title: "Apple", date: "4 July 2026", amount: "$12", balance: "$27.00" },
  { id: 4, kind: "food", title: "Falafel station", date: "4 July 2026", amount: "$12", balance: "$27.00" },
  { id: 5, kind: "food", title: "Falafel station", date: "4 July 2026", amount: "$12", balance: "$27.00" },
  { id: 6, kind: "food", title: "Falafel station", date: "4 July 2026", amount: "$12", balance: "$27.00" },
  { id: 7, kind: "food", title: "Falafel station", date: "4 July 2026", amount: "$12", balance: "$27.00" },
  { id: 8, kind: "food", title: "Falafel station", date: "4 July 2026", amount: "$12", balance: "$27.00" },
];

const pill = "flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]";

export default function ActivityScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState(0);

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto w-full max-w-[520px] pb-[max(40px,env(safe-area-inset-bottom))]">
        <ScrollHeader
          title="Activity"
          left={
            <button type="button" aria-label="Back" onClick={() => router.push("/money")} className={pill}>
              <ChevronLeftIcon className="size-6" />
            </button>
          }
          right={
            <HelpLink aria-label="Help" className={pill}>
              <QuestionCircleIcon className="size-6" />
            </HelpLink>
          }
        />
        <div className="-mt-3 flex gap-2 overflow-x-auto px-4 pb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f, i) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(i)}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-3 text-[15px] font-medium leading-[19px] tracking-[-0.15px] transition-colors ${
                filter === i ? "bg-black text-white" : "bg-[#f3f3f3] text-black"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <ul className="flex flex-col gap-6 px-4">
          {ITEMS.map((it) => (
            <ActivityRow key={it.id} item={it} />
          ))}
        </ul>
      </div>
    </main>
  );
}
