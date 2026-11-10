"use client";

import { useRouter } from "next/navigation";
import { BackPill, PrimaryButton } from "@/components/coparent-parts";
import { CalendarIcon } from "@/components/icons";
import { DollarIcon, SendIcon } from "@/components/topup-screen";

// Parent flow: what a co-parent gets, then on to the invite screen.
const ROWS = [
  {
    icon: <DollarIcon />,
    title: "Your money stays in PayPal",
    text: "Only you can top up. Nothing moves to Pudding.",
  },
  {
    icon: <SendIcon />,
    title: "Pay only when approved",
    text: "Approved purchases are charged separately through your PayPal account.",
  },
  {
    icon: <CalendarIcon className="size-6 text-black" />,
    title: "Co-parent assigns tasks",
    text: "Approved purchases are charged separately through your PayPal account.",
  },
];

export default function CoparentAddScreen() {
  const router = useRouter();
  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto w-full max-w-[520px] pb-[140px] pt-[max(16px,env(safe-area-inset-top))]">
        <div className="px-4">
          <BackPill />
        </div>
        <div className="flex flex-col gap-2 px-4 pb-8 pt-6 text-black">
          <h1 className="font-display text-[32px] font-bold leading-10 tracking-[-0.64px]">Add co-parent</h1>
          <p className="text-[17px] leading-[25px] tracking-[-0.17px]">
            Share the load. Your co-parent can help manage your kids’ spending.
          </p>
        </div>
        <div className="flex flex-col gap-7">
          <h2 className="px-4 text-[20px] font-semibold leading-7 tracking-[-0.15px] text-black">
            What will be you getting
          </h2>
          <div className="flex flex-col px-4">
            {ROWS.map((r, i) => (
              <div
                key={r.title}
                className={`flex items-start gap-5 py-5 first:pt-0 last:pb-0 ${
                  i < ROWS.length - 1 ? "border-b border-[#e8e8e8]" : ""
                }`}
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#eff4fe]">
                  {r.icon}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-black">
                  <p className="text-[17px] font-medium leading-[22px] tracking-[-0.17px]">{r.title}</p>
                  <p className="text-[15px] leading-[22px] tracking-[-0.15px]">{r.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[520px] bg-gradient-to-t from-white from-70% to-white/0 px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-6">
        <PrimaryButton onClick={() => router.push("/coparent/invite")}>Continue</PrimaryButton>
      </div>
    </main>
  );
}
