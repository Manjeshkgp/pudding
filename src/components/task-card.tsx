"use client";

import { useState } from "react";
import PinCard from "@/components/pin-card";

export type Task = { id: number; icon: string; title: string; reward: string };

// Height of a card with three tasks
const CARD_H = 352;
// Header + progress bar, with the card padding above them
const BAR_H = 24 + 20 + 20 + 20;

const label15 = "text-[15px] font-medium leading-[19px] tracking-[-0.15px]";

function ClockIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke={color} strokeWidth="1.8" />
      <path d="M10 5.8V10l2.8 1.8" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// A list of tasks with a progress bar, a time left label and checkboxes.
export default function TaskCard({
  title,
  timeLeft,
  urgent = true,
  progress,
  tasks,
  pinTop,
}: {
  title: string;
  timeLeft: string;
  // Orange time label when it is running out, grey otherwise
  urgent?: boolean;
  progress: { done: number; total: number };
  tasks: Task[];
  /** Where this card starts on the page. When set, it pins and shrinks while scrolling. */
  pinTop?: number;
}) {
  const [done, setDone] = useState<number[]>([]);
  const toggle = (id: number) =>
    setDone((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  const timeColor = urgent ? "#ff9500" : "#a6a6a6";

  const header = (
    <div className="flex items-center justify-between">
      <span className={`${label15} text-[#a6a6a6]`}>{title}</span>
      <span className="flex items-center gap-1.5">
        <ClockIcon color={timeColor} />
        <span className={label15} style={{ color: timeColor }}>
          {timeLeft}
        </span>
      </span>
    </div>
  );

  const progressBar = (
  <div className="relative h-5 overflow-hidden rounded-full bg-[#f3f3f3]">
    <div
      className="absolute inset-y-0 left-0 rounded-full bg-[#ff9500]"
      style={{ width: `${(progress.done / progress.total) * 100}%` }}
    />
    <span className="absolute inset-0 flex items-center justify-center text-[12px] font-medium leading-4 tracking-[-0.12px] text-white">
      {progress.done}/{progress.total}
    </span>
  </div>
  );

  const body = (
    <>
      {progressBar}
      <ul className="flex flex-col gap-4">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[#f3f3f3]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.icon} alt="" width={32} height={32} />
            </div>
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="font-display text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black">{t.title}</span>
              <span className={`${label15} text-[#a6a6a6]`}>{t.reward}</span>
            </div>
            <button
              type="button"
              role="checkbox"
              aria-checked={done.includes(t.id)}
              aria-label={`Mark "${t.title}" done`}
              onClick={() => toggle(t.id)}
              className={`flex size-6 items-center justify-center rounded-md border-2 ${done.includes(t.id) ? "border-black bg-black" : "border-[#a6a6a6]"}`}
            >
              {done.includes(t.id) && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m5 12.5 4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  );

  if (pinTop !== undefined) {
    // Header and progress bar stay as a bar at the top; the tasks slide up under it.
    return (
      <PinCard
        top={pinTop}
        height={CARD_H}
        labelHeight={20}
        barHeight={BAR_H}
        pinnedHeight={BAR_H + 24}
        label={
          <div className="flex flex-col gap-5">
            {header}
            {progressBar}
          </div>
        }
      >
        {header}
        {body}
      </PinCard>
    );
  }

  return (
    <section className="flex flex-col gap-5 rounded-[32px] bg-white px-5 py-6 drop-shadow-[0px_2px_10px_rgba(0,0,0,0.12)]">
      {header}
      {body}
    </section>
  );
}
