"use client";
import Link from "next/link";
import ActivityRow, { type ActivityItem } from "@/components/activity-row";
import { useRemote, Status } from "@/components/app-ui";
import { usePagedList } from "@/components/paged-list";
import { type ChildHome, money } from "@/lib/app-types";

export default function MoneyScreen() {
  const home = useRemote<ChildHome>("/api/child/home");
  const list = usePagedList<ActivityItem>("/api/transactions?view=feed");
  const data = home.data;
  const currency = data?.profile.currency || "USD";
  const available = Math.max(0, Number(data?.wallet?.spendBalance || 0) - Number(data?.wallet?.purchaseReservedBalance || 0));
  return <main className="min-h-dvh bg-[#a0e1e1]"><div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-2 pb-[170px] pt-[max(24px,env(safe-area-inset-top))]">
    <h1 className="px-2 font-display text-[32px] font-bold text-white">Your money</h1>
    <Status loading={home.loading} error={home.error} />
    {data && <section className="flex flex-col gap-5 rounded-[32px] bg-white px-5 py-6 shadow-sm">
      <div><p className="text-[#777]">{data.weeklySpending ? "Weekly spending remaining" : "Spend allowance available"}</p><p className="font-display text-4xl font-bold">{money(data.weeklySpending?.remaining ?? available, currency)}{data.weeklySpending && <span className="text-xl text-[#777]"> / {money(data.weeklySpending.limit, currency)}</span>}</p></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-[20px] bg-[#f3f3f3] p-4"><img src="/kid-home/wallet.svg" alt="" className="h-8" /><p className="mt-3 text-sm text-[#777]">Spend allowance</p><p className="font-display text-xl font-bold">{money(available, currency)}</p></div>
        <Link href="/savings" className="rounded-[20px] bg-[#f3f3f3] p-4"><img src="/kid-home/savings.svg" alt="" className="h-8" /><p className="mt-3 text-sm text-[#777]">Savings</p><p className="font-display text-xl font-bold">{money(data.wallet?.saveBalance, currency)}</p></Link>
      </div>
    </section>}
    <section className="flex flex-col gap-5 rounded-[32px] bg-white px-5 py-6 shadow-sm"><h2 className="text-xl font-semibold">Activity</h2><Status loading={list.loading} error={list.error} />{!list.loading && !list.error && !list.items.length && <p>No wallet activity yet.</p>}<ul className="flex flex-col gap-6">{list.items.slice(0, 5).map(item => <ActivityRow key={item.id} item={item} currency={currency} />)}</ul><Link href="/activity" className="border-t border-[#e8e8e8] pt-4 text-center font-semibold">See all activity ›</Link></section>
  </div></main>;
}
