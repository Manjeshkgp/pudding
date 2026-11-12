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
  const icon = item.walletBucket === "SAVE" || item.type === "GOAL_DEPOSIT"
    ? "/kids-money-icons/To%20savings.svg"
    : item.type === "INSTANT_TRANSFER" || item.type === "ALLOWANCE"
      ? "/kids-money-icons/From%20parent.svg"
      : item.type === "SPEND_OPTION_B_ORDER"
        ? "/kid-home/activity-shop.svg"
        : "/kid-home/activity-wallet.svg";
  return <li className="flex items-center gap-3">
    <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#eff4fe]"><img src={icon} alt="" width={28} height={28} /></span>
    <div className="flex min-w-0 flex-1 flex-col gap-1.5"><span className="font-display text-[17px] font-medium">{item.description || "Wallet activity"}</span><time className="text-[15px] text-[#777]">{new Date(item.createdAt).toLocaleDateString()}</time></div>
    <span className={`font-display text-[17px] font-medium ${income ? "text-[#0e8345]" : "text-black"}`}>{income ? "+" : "−"}{money(item.amount, currency)}</span>
  </li>;
}

export function PurchaseActivityRow({ id, title, status, amount, currency, date, categories }: { id: string; title: string; status: string; amount: string; currency: string; date: string; categories: string[] }) {
  const types = new Set(categories.map(category => category.trim().toLowerCase()));
  const icon = types.size === 1 && types.has("food") ? "/kids-money-icons/food.svg"
    : types.size === 1 && (types.has("grocery") || types.has("groceries")) ? "/kids-money-icons/Grocery.svg"
    : "/kid-home/activity-shop.svg";
  return <li><Link href={`/purchases/${id}`} className="flex items-center gap-3"><span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#eff4fe]"><img src={icon} alt="" width={28} height={28} /></span><span className="flex min-w-0 flex-1 flex-col gap-1"><span className="font-medium">{title}</span><span className="text-sm text-[#777]">{status.toLowerCase().replaceAll("_", " ")} · {new Date(date).toLocaleDateString()}</span></span><span>{money(amount, currency)}</span></Link></li>;
}
