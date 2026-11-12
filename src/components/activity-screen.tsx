"use client";
import { useState } from "react";
import ActivityRow, { PurchaseActivityRow, type ActivityItem } from "@/components/activity-row";
import HelpLink from "@/components/help-link";
import ScrollHeader from "@/components/scroll-header";
import BackButton from "@/components/back-button";
import { ChevronLeftIcon, QuestionCircleIcon } from "@/components/icons";
import { ListEnd, usePagedList } from "@/components/paged-list";
import { Status, useRemote } from "@/components/app-ui";
import type { Me, Purchase } from "@/lib/app-types";

const FILTERS = ["All", "Today", "Last week", "Last month"] as const;
const pill = "flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]";
function startDate(filter: number) {
  if (!filter) return "";
  const d = new Date();
  if (filter === 1) d.setHours(0, 0, 0, 0);
  else if (filter === 2) d.setDate(d.getDate() - 7);
  else d.setMonth(d.getMonth() - 1);
  return `&startDate=${encodeURIComponent(d.toISOString())}`;
}
export default function ActivityScreen() {
  const [filter, setFilter] = useState(0);
  const [tab, setTab] = useState<"wallet" | "purchases">("wallet");
  const [since, setSince] = useState("");
  const me = useRemote<Me>("/api/auth/me");
  const wallet = usePagedList<ActivityItem>(tab === "wallet" ? `/api/transactions?view=feed${since}` : null);
  const purchases = usePagedList<Purchase>(tab === "purchases" ? `/api/purchases?view=feed${since}` : null);
  const list = tab === "wallet" ? wallet : purchases;
  return <main className="min-h-dvh bg-white"><div className="mx-auto w-full max-w-[520px] pb-[max(40px,env(safe-area-inset-bottom))]">
    <ScrollHeader title="Activity" left={<BackButton fallback="/money" aria-label="Back" className={pill}><ChevronLeftIcon className="size-6" /></BackButton>} right={<HelpLink aria-label="Help" className={pill}><QuestionCircleIcon className="size-6" /></HelpLink>} />
    <div className="flex gap-2 px-4 pb-4">{(["wallet", "purchases"] as const).map(t => <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className={`rounded-full px-4 py-3 text-sm font-medium ${tab === t ? "bg-black text-white" : "bg-[#f3f3f3]"}`}>{t === "wallet" ? "Wallet activity" : "Purchases"}</button>)}</div>
    <div className="flex gap-2 overflow-x-auto px-4 pb-8">{FILTERS.map((f,i) => <button key={f} onClick={() => { setFilter(i); setSince(startDate(i)); }} aria-pressed={filter === i} className={`shrink-0 rounded-full px-4 py-3 text-sm ${filter === i ? "bg-black text-white" : "bg-[#f3f3f3]"}`}>{f}</button>)}</div>
    <div className="px-4"><Status loading={list.loading} error={list.error || me.error} />{!list.loading && !list.error && !list.items.length && <p>No activity for this period.</p>}<ul className="flex flex-col gap-6">{tab === "wallet" ? wallet.items.map(item => <ActivityRow key={item.id} item={item} currency={me.data?.family.currency} />) : purchases.items.map(p => <PurchaseActivityRow key={p.id} id={p.id} title={p.items?.map(item => item.name).join(", ") || "Purchase"} status={p.status} amount={p.amount} currency={p.currency} date={p.createdAt} />)}</ul><ListEnd list={list} /></div>
  </div></main>;
}
