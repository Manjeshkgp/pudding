"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox } from "lucide-react";
import { AVATARS } from "@/components/avatar-sheet";
import { Empty, Status, useRemote } from "@/components/app-ui";
import { ListEnd, usePagedList } from "@/components/paged-list";
import { CardIcon, RefreshIcon, SlidersIcon } from "@/components/icons";
import TopupPill from "@/components/topup-pill";
import { hasParentPermission } from "@/lib/co-parent-permissions";
import { type Kid, money } from "@/lib/app-types";
import { topupPath, topupPinSetupPath } from "@/lib/topup-navigation";

type Summary = {
  parent: { name: string; avatar: string; role: string; permissionLevel: string; permissions?: unknown; pinSet: boolean; paypalVaultConnected: boolean };
  limit: { total: string; spent: string; reserved: string; available: string; currency: string; unallocated: string };
  unreadNotifications: number;
};
function BankIcon({ className }: { className?: string }) {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.5L2.5 8V10H21.5V8L12 2.5ZM12 4.8L17.6 8H6.4L12 4.8ZM5 11.5H7V17H5V11.5ZM11 11.5H13V17H11V11.5ZM17 11.5H19V17H17V11.5ZM2.5 18.5H21.5V21H2.5V18.5Z" fill="currentColor" /></svg>;
}

export default function ParentHome() {
  const router = useRouter();
  const summary = useRemote<Summary>("/api/family/summary?children=omit", 0, true);
  const children = usePagedList<Kid>("/api/children?view=feed");
  const data = summary.data;
  const parentAvatar = AVATARS.find(a => a.id === data?.parent.avatar) || AVATARS[0];
  const canManage = hasParentPermission(data?.parent, "canManageChildren");
  const canBudget = hasParentPermission(data?.parent, "canManageBudget");
  const currency = data?.limit.currency || "USD";
  const topup = data?.parent.pinSet ? topupPath : topupPinSetupPath;
  return <main className="min-h-dvh bg-[#f3f3f3]"><div className="mx-auto w-full max-w-[520px] pb-[140px] pt-[max(16px,env(safe-area-inset-top))]">
    <div className="flex items-center justify-between px-4">
      <Link href="/account" aria-label="Account" className="size-11 shrink-0 overflow-hidden rounded-full" style={{ backgroundColor: parentAvatar.bg }}><img src={parentAvatar.src} alt="" className="size-full" /></Link>
      <Link href="/inbox" aria-label={data?.unreadNotifications ? `Inbox, ${data.unreadNotifications} unread notifications` : "Inbox"} className="flex items-center justify-center gap-1 rounded-full bg-white px-3 py-2"><Inbox className="size-6" aria-hidden="true" /><span className="font-display text-[15px] font-semibold">Inbox</span>{!!data?.unreadNotifications && <span className="rounded-full bg-black px-1.5 text-xs text-white">{data.unreadNotifications > 99 ? "99+" : data.unreadNotifications}</span>}</Link>
    </div>
    <div className="px-4 pt-4"><Status loading={summary.loading} error={summary.error} />{summary.error && <button onClick={summary.reload} className="underline">Retry</button>}</div>
    {data && <>
      <div className="flex flex-col gap-1 px-4 pb-7 pt-3"><p className="text-[17px] font-medium text-[#5e5e5e]">Family spending available</p><p className="font-display text-[52px] font-bold leading-[64px] tracking-[-0.78px]">{money(data.limit.available, currency)}</p><p className="text-sm text-[#5e5e5e]">Shared family limit · {money(data.limit.spent, currency)} used{Number(data.limit.reserved) > 0 && ` · ${money(data.limit.reserved, currency)} pending`}</p>{canBudget && <Link href={topup} className="self-start text-[15px] font-medium underline">Increase family limit</Link>}</div>
      {!data.parent.paypalVaultConnected && <Link href="/account/paypal" className="mx-4 mb-3 block rounded-2xl bg-white p-4 font-medium">Connect your PayPal wallet ›</Link>}
      {!data.parent.pinSet && <Link href="/account/security" className="mx-4 mb-3 block rounded-2xl bg-white p-4 font-medium">Create your parent PIN ›</Link>}
      <div className="flex flex-col gap-3 p-2"><Status loading={children.loading} error={children.error} />{!children.loading && !children.error && !children.items.length && <Empty>No children added yet. You can add a child from your account.</Empty>}
        {children.items.map(k => {
          const avatar = AVATARS.find(a => a.id === k.avatar) || AVATARS[0];
          const available = Math.max(0, Number(k.wallet?.spendBalance || 0) - Number(k.wallet?.purchaseReservedBalance || 0));
          const saving = Number(k.wallet?.saveBalance || 0);
          const active = Boolean(k.pinSet);
          return <section key={k.id} className="overflow-clip rounded-[32px]"><div className="flex flex-col gap-3 bg-white py-6"><div className="flex items-center gap-3 px-5"><img src={avatar.src} alt="" className="size-16 shrink-0 rounded-full" style={{ backgroundColor: avatar.bg }} /><div className="flex flex-col gap-1"><h2 className="font-display text-xl font-bold">{k.name}</h2>{canManage && <Link href={`/children/${k.id}/settings`} className="flex items-center gap-2 text-[15px] font-medium text-[#777]"><SlidersIcon className="size-5" />Manage</Link>}</div>{k.isFrozen && <span className="ml-auto text-sm">Paused</span>}</div>
            <div className="flex flex-col"><div className="flex items-center justify-between border-y border-[#e8e8e8] p-5"><span className="flex items-center gap-5 font-medium"><CardIcon className="size-6" />Wallet</span>{active ? <span className="font-medium">{money(available + saving, currency)}</span> : canManage && hasParentPermission(data.parent, "canManageSpendingRules") ? <Link href={`/activate/${k.id}`} className="rounded-full bg-black px-4 py-3 text-sm font-medium text-white">Activate</Link> : <span className="text-sm text-[#777]">Not activated</span>}</div>
            <Link href={`/goals?childId=${k.id}`} className="flex items-center justify-between border-b border-[#e8e8e8] p-5"><span className="flex items-center gap-5 font-medium"><BankIcon className="size-6" />Savings</span><span>{money(saving, currency)} ›</span></Link>
            <Link href={`/allowances?childId=${k.id}`} className="flex items-center justify-between px-5 pt-5"><span className="flex items-center gap-5 font-medium"><RefreshIcon className="size-6" />Allowance</span><span>{money(available, currency)} ›</span></Link></div></div>
            {!active && <div className="bg-[#a0e1e1] px-5 py-4 text-[15px] font-medium">Activate the wallet to get login credentials for your child.</div>}</section>;
        })}
        <ListEnd list={children} />
      </div>
    </>}
    {data && canBudget && <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[max(48px,env(safe-area-inset-bottom))]"><TopupPill label="Top up" onClick={() => router.push(topup)} /></div>}
  </div></main>;
}
