"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRightIcon } from "@/components/icons";
import { ChildHome, money } from "@/lib/app-types";
import { useRemote, useAction, Status } from "@/components/app-ui";
import { useRouter } from "next/navigation";
import PinCard from "@/components/pin-card";
import { AVATARS } from "@/components/avatar-sheet";

const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), {
  ssr: false,
});

const CARD_TOP = 590; // where the first card starts on the page
const CARD1_H = 436;

const label15 = "text-[15px] font-medium leading-[19px] tracking-[-0.15px]";

function Sticker({ src, size = 32 }: { src: string; size?: number }) {
  return (
    <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[#f3f3f3]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={size} height={size} />
    </div>
  );
}

function ClockIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="7.5" stroke="#ff9500" strokeWidth="1.8" />
      <path
        d="M10 5.8V10l2.8 1.8"
        stroke="#ff9500"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function KidHome() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const remote = useRemote<ChildHome>("/api/child/home", 10000);
  const action = useAction();
  const data = remote.data;
  const avatar =
    AVATARS[Number(data?.profile.avatar?.replace("avatar-", "")) - 1] ??
    AVATARS[0];
  const goals =
    data?.savingsGoals.reduce((n, g) => n + Number(g.currentAmount), 0) || 0;
  const total =
    Number(data?.wallet?.spendBalance || 0) +
    Number(data?.wallet?.saveBalance || 0) +
    goals;
  const SUMMARY = [
    {
      icon: "/kid-home/wallet.svg",
      label: "Spend available",
      amount: money(
        Number(data?.wallet?.spendBalance || 0) -
          Number(data?.wallet?.purchaseReservedBalance || 0),
      ),
      href: "/money",
    },
    {
      icon: "/kid-home/savings.svg",
      label: "Your savings",
      amount: money(data?.wallet?.saveBalance),
      href: "/money",
    },
    {
      icon: "/kid-home/quest.svg",
      label: "Your quests",
      amount: money(goals),
      href: "/quest",
    },
  ];
  const TASKS = (data?.chores || [])
    .filter((c) => c.recurrence === "DAILY")
    .slice(0, 3)
    .map((c) => ({
      id: c.id,
      icon: "/kid-home/task-wand.svg",
      title: c.title,
      reward: money(c.rewardAmount),
      submitted: ["PENDING", "APPROVED"].includes(
        c.latestSubmission?.status || "",
      ),
    }));
  const done = TASKS.filter((t) => t.submitted).map((t) => t.id);

  // "Ask me anything" pops up now and then: every 10 seconds, stays for 4.
  const [bubble, setBubble] = useState(false);
  useEffect(() => {
    let hide: number | undefined;
    const pop = () => {
      setBubble(true);
      hide = window.setTimeout(() => setBubble(false), 4000);
    };
    const first = window.setTimeout(pop, 3000);
    const every = window.setInterval(pop, 10000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
      window.clearTimeout(hide);
    };
  }, []);
  const toggle = (id: string) => router.push(`/chores/${id}/proof`);

  return (
    <main className="min-h-dvh bg-[#ffc091]">
      <div className="relative mx-auto w-full max-w-[520px] overflow-clip pb-[171px]">
        {/* Room and cat */}
        {/* Fixed layer: the cards scroll up over it */}
        <div className="fixed inset-x-0 top-0 z-0 mx-auto h-[692px] w-full max-w-[520px] overflow-hidden">
          <div
            aria-hidden
            className="absolute left-1/2 top-[-10px] h-[692px] w-[522px] -translate-x-1/2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/kid-home/room.svg"
              alt=""
              className="absolute inset-0 size-full max-w-none"
            />
            <div className="absolute left-[123.54px] top-[200.41px] size-[300px]">
              <Lottie
                src="/lottie/confident-cat.json"
                loop
                autoplay={!reduceMotion}
                className="size-full"
              />
            </div>
          </div>

          {/* Cat speech bubble */}
          <AnimatePresence>
            {bubble && (
              <motion.button
                onClick={() => window.location.assign("/quest")}
                key="ask"
                type="button"
                initial={
                  reduceMotion
                    ? false
                    : { opacity: 0, scale: 0.3, x: -14, y: 10, rotate: -6 }
                }
                animate={{
                  opacity: 1,
                  scale: 1,
                  x: 0,
                  y: 0,
                  rotate: 0,
                  transition: {
                    type: "spring",
                    stiffness: 420,
                    damping: 16,
                    mass: 0.8,
                  },
                }}
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        scale: 0.5,
                        x: -10,
                        y: -8,
                        rotate: 4,
                        filter: "blur(3px)",
                        transition: { duration: 0.28, ease: [0.4, 0, 1, 1] },
                      }
                }
                style={{ transformOrigin: "left bottom" }}
                className="absolute left-[230px] top-[360px] z-10 flex items-center justify-center whitespace-nowrap rounded-2xl bg-[#f3f3f3] px-5 py-2 font-display text-[15px] font-bold leading-6 tracking-[-0.3px] text-black"
              >
                <svg
                  aria-hidden
                  width="34"
                  height="26"
                  viewBox="0 0 34 26"
                  fill="none"
                  className="absolute left-[-23.14px] top-[4.34px] h-[25.657px] w-[33.799px]"
                >
                  <path
                    d="M0.521525 0.000137329C-3.78449 24.1497 19.6317 26.9114 31.878 25.2736C34.2962 19.1891 36.3713 8.42419 25.3263 14.0403C14.2813 19.6564 4.18771 7.02022 0.521525 0.000137329Z"
                    fill="#F3F3F3"
                  />
                </svg>
                Ready for your next quest?
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Header */}
        <header className="fixed inset-x-0 top-0 z-0 mx-auto flex w-full max-w-[520px] items-center justify-between bg-gradient-to-b from-black/40 to-transparent px-4 pb-[60px] pt-[max(24px,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatar.src}
              alt=""
              className="size-10 rounded-full border border-white bg-[#ffd7ef] object-cover"
            />
            <h1 className="font-display text-[32px] font-bold leading-10 tracking-[-0.64px] text-white">
              {data?.profile.name.split(" ")[0] || "Your pudding"}
            </h1>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-white px-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kid-home/coin.svg" alt="" width={24} height={24} />
            <span className="font-display text-[15px] font-semibold leading-[19px] tracking-[-0.15px] text-black">
              {data?.profile.xp || 0} XP
            </span>
          </div>
        </header>

        {/* Cards */}
        <div className="relative z-10 flex flex-col gap-2.5 p-2 pt-[526px]">
          <Status
            error={remote.error || action.error}
            notice={action.notice}
            loading={remote.loading}
          />
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/scan"
              className="rounded-full bg-black px-5 py-4 text-center font-semibold text-white"
            >
              Scan & pay
            </Link>
            <Link
              href="/inbox"
              className="rounded-full bg-white px-5 py-4 text-center font-semibold"
            >
              Inbox
            </Link>
          </div>
          <PinCard
            top={CARD_TOP}
            height={CARD1_H}
            labelHeight={22}
            label={
              <p className="text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-[#a6a6a6]">
                Total in your pudding
              </p>
            }
          >
            <div className="relative flex flex-col gap-2">
              <p
                aria-hidden
                className="invisible text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-[#a6a6a6]"
              >
                Total in your pudding
              </p>
              <p className="font-display text-[52px] font-extrabold leading-[64px] tracking-[-0.78px] text-black">
                {money(total)}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/kid-home/coin-stack.svg"
                alt=""
                width={48}
                height={48}
                className="absolute right-0 top-[30px]"
              />
            </div>
            <ul className="flex flex-col">
              {SUMMARY.map((row, i) => (
                <li
                  key={row.label}
                  className={`flex items-center gap-3 py-5 ${i === 0 ? "pt-0" : ""} ${i < SUMMARY.length - 1 ? "border-b border-[#e8e8e8]" : "pb-0"}`}
                >
                  <Sticker src={row.icon} />
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className={`${label15} text-[#a6a6a6]`}>
                      {row.label}
                    </span>
                    <span className="font-display text-[20px] font-bold leading-7 tracking-[-0.15px] text-black">
                      {row.amount}
                    </span>
                  </div>
                  <Link href={row.href} aria-label={`Open ${row.label}`}>
                    <ChevronRightIcon className="size-6 text-[#a6a6a6]" />
                  </Link>
                </li>
              ))}
            </ul>
          </PinCard>

          <section className="flex flex-col gap-5 rounded-[32px] bg-white px-5 py-6 drop-shadow-[0px_2px_10px_rgba(0,0,0,0.12)]">
            <div className="flex items-center justify-between">
              <span className={`${label15} text-[#a6a6a6]`}>Daily</span>
              <span className="flex items-center gap-1.5">
                <ClockIcon />
                <span className={`${label15} text-[#ff9500]`}>Daily tasks</span>
              </span>
            </div>
            <div className="relative h-5 overflow-hidden rounded-full bg-[#f3f3f3]">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[#ff9500]"
                style={{
                  width: `${TASKS.length ? (done.length / TASKS.length) * 100 : 0}%`,
                }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[12px] font-medium leading-4 tracking-[-0.12px] text-white">
                {done.length}/{TASKS.length}
              </span>
            </div>
            {TASKS.length === 0 && (
              <p className="text-[#5e5e5e]">
                No daily tasks yet. Your parent can add one.
              </p>
            )}
            <ul className="flex flex-col gap-4">
              {TASKS.map((t) => (
                <li key={t.id} className="flex items-center gap-3">
                  <Sticker src={t.icon} size={32} />
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="font-display text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black">
                      {t.title}
                    </span>
                    <span className={`${label15} text-[#a6a6a6]`}>
                      {t.reward}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done.includes(t.id)}
                    aria-label={`Open evidence for "${t.title}"`}
                    disabled={t.submitted || action.busy}
                    onClick={() => toggle(t.id)}
                    className={`flex size-6 items-center justify-center rounded-md border-2 ${done.includes(t.id) ? "border-black bg-black" : "border-[#a6a6a6]"}`}
                  >
                    {done.includes(t.id) && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="m5 12.5 4.5 4.5L19 7.5"
                          stroke="#fff"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-center border-t border-[#e8e8e8] pt-4">
              <Link
                href="/earn"
                className="flex items-center gap-1 text-[17px] font-semibold leading-[22px] tracking-[-0.17px] text-black"
              >
                See all tasks
                <ChevronRightIcon className="size-6 text-black" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
