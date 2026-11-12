import Link from "next/link";
import { money } from "@/lib/app-types";

export type ActivityItem = {
  id: string;
  description: string | null;
  amount: string;
  direction: string;
  createdAt: string;
  walletBucket?: string;
  type?: string;
};

export default function ActivityRow({ item, currency = "USD" }: { item: ActivityItem; currency?: string }) {
  const income = item.direction === "CREDIT";
  const icon = item.walletBucket === "SAVE" ? "savings" : item.type === "SPEND_OPTION_B_ORDER" ? "shop" : "wallet";
  return <li className="flex items-center gap-3">
    <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#eff4fe]"><img src={`/kid-home/activity-${icon}.svg`} alt="" width={28} height={28} /></span>
    <div className="flex min-w-0 flex-1 flex-col gap-1.5"><span className="font-display text-[17px] font-medium">{item.description || "Wallet activity"}</span><time className="text-[15px] text-[#777]">{new Date(item.createdAt).toLocaleDateString()}</time></div>
    <span className={`font-display text-[17px] font-medium ${income ? "text-[#0e8345]" : "text-black"}`}>{income ? "+" : "−"}{money(item.amount, currency)}</span>
  </li>;
}

export function PurchaseActivityRow({ id, title, status, amount, currency, date }: { id: string; title: string; status: string; amount: string; currency: string; date: string }) {
  return <li><Link href={`/purchases/${id}`} className="flex items-center gap-3"><span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#eff4fe]"><img src="/kid-home/activity-shop.svg" alt="" width={28} height={28} /></span><span className="flex min-w-0 flex-1 flex-col gap-1"><span className="font-medium">{title}</span><span className="text-sm text-[#777]">{status.toLowerCase().replaceAll("_", " ")} · {new Date(date).toLocaleDateString()}</span></span><span>{money(amount, currency)}</span></Link></li>;
}
