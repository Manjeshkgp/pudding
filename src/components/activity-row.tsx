// One line of the activity list, shared by the money and activity screens.
export type ActivityItem = {
  id: number;
  kind: "food" | "wallet" | "shop" | "savings";
  title: string;
  date: string;
  amount: string;
  balance: string;
  income?: boolean;
};

const ICONS: Record<ActivityItem["kind"], string> = {
  food: "/kid-home/activity-food.svg",
  wallet: "/kid-home/activity-wallet.svg",
  shop: "/kid-home/activity-shop.svg",
  savings: "/kid-home/activity-savings.svg",
};

export default function ActivityRow({ item: a }: { item: ActivityItem }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#eff4fe]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ICONS[a.kind]} alt="" width={28} height={28} />
      </span>
      <div className="flex min-w-px flex-1 flex-col gap-1.5">
        <span className="font-display text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black">
          {a.title}
        </span>
        <span className="text-[15px] leading-[22px] tracking-[-0.15px] text-[#a6a6a6]">{a.date}</span>
      </div>
      <div className="flex w-[86px] shrink-0 flex-col gap-1.5 text-right">
        <span
          className={`font-display text-[17px] font-medium leading-[22px] tracking-[-0.17px] ${a.income ? "text-[#0e8345]" : "text-black"}`}
        >
          {a.amount}
        </span>
        <span className="text-[15px] leading-[22px] tracking-[-0.15px] text-[#a6a6a6]">{a.balance}</span>
      </div>
    </li>
  );
}
