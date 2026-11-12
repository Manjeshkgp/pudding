import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons";
import ActivityRow, { type ActivityItem } from "@/components/activity-row";

// Kid "Your money" screen. Sample data only, nothing is loaded.

const WALLET = "$5.00";
const SAVINGS = "$5.00";

const ACTIVITY: ActivityItem[] = [
  { id: 1, kind: "food", title: "Falafel station", date: "4 July 2026", amount: "$12", balance: "$27.00" },
  { id: 2, kind: "wallet", title: "From Dad", date: "4 July 2026", amount: "+ $12", balance: "$27.00", income: true },
  { id: 3, kind: "shop", title: "Apple", date: "4 July 2026", amount: "$12", balance: "$27.00" },
  { id: 4, kind: "food", title: "Falafel station", date: "4 July 2026", amount: "$12", balance: "$27.00" },
  { id: 5, kind: "food", title: "Falafel station", date: "4 July 2026", amount: "$12", balance: "$27.00" },
];

function Tile({ icon, label, amount }: { icon: string; label: string; amount: string }) {
  return (
    <div className="flex min-w-px flex-1 flex-col gap-4 rounded-[20px] bg-[#f3f3f3] p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icon} alt="" className="h-8 w-auto self-start" />
      <div className="flex flex-col gap-0.5 tracking-[-0.15px]">
        <span className="text-[15px] leading-[22px] text-[#a6a6a6]">{label}</span>
        <span className="font-display text-xl font-bold leading-7 text-black">{amount}</span>
      </div>
    </div>
  );
}

export default function MoneyScreen() {
  return (
    <main
      className="min-h-dvh"
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0) 90px), linear-gradient(90deg, #a0e1e1, #a0e1e1)",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 overflow-clip pb-[170px] pt-[max(24px,env(safe-area-inset-top))]">
        <header className="px-4">
          <h1 className="font-display text-[32px] font-bold leading-10 tracking-[-0.64px] text-white">
            Your money
          </h1>
        </header>

        <div className="flex flex-col gap-2.5 px-2">
          <section className="relative flex flex-col gap-5 rounded-[32px] bg-white px-5 py-6 drop-shadow-[0px_2px_10px_rgba(0,0,0,0.12)]">
            <div className="flex flex-col gap-2">
              <p className="text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-[#a6a6a6]">
                Amount left to spend this week
              </p>
              <p className="flex items-baseline gap-1.5 font-display text-[52px] font-extrabold leading-[64px] tracking-[-0.78px] text-black">
                $34
                <span className="text-[32px] font-bold leading-10 tracking-[-0.64px]">/$50</span>
              </p>
            </div>
            <div className="flex gap-4">
              <Tile icon="/kid-home/wallet.svg" label="In your wallet" amount={WALLET} />
              <Tile icon="/kid-home/savings.svg" label="Savings" amount={SAVINGS} />
            </div>
            <span className="absolute left-1/2 top-[188px] flex size-10 -translate-x-1/2 items-center justify-center rounded-full bg-white">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5V19M5 12H19" stroke="#000" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
          </section>

          <section className="flex flex-col gap-5 rounded-[32px] bg-white px-5 py-6 drop-shadow-[0px_2px_10px_rgba(0,0,0,0.12)]">
            <h2 className="text-xl font-semibold leading-7 tracking-[-0.15px] text-black">Activity</h2>
            <ul className="flex flex-col gap-6">
              {ACTIVITY.map((a) => (
                <ActivityRow key={a.id} item={a} />
              ))}
            </ul>
            <div className="flex items-center justify-center border-t border-[#e8e8e8] pt-4">
              <Link href="/activity" className="flex items-center gap-1 text-[17px] font-semibold leading-[22px] tracking-[-0.17px] text-black">
                See all activity
                <ChevronRightIcon className="size-6 text-black" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
