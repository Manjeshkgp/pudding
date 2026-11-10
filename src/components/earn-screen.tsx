import TaskCard, { type Task } from "@/components/task-card";

// Kid "Earn" screen. Sample data only.
const TASKS: Task[] = [
  { id: 1, icon: "/kid-home/task-wand.svg", title: "Make your bed early", reward: "$27.00" },
  { id: 2, icon: "/kid-home/task-lab.svg", title: "Make your bed early", reward: "$27.00" },
  { id: 3, icon: "/kid-home/task-medal.svg", title: "Make your bed early", reward: "$27.00" },
];

const PROGRESS = { done: 2, total: 4 };
// Where the first card starts on the page: top padding 24 + title 40 + gap 16
const PAGE_TOP = 80;

export default function EarnScreen() {
  return (
    <main className="min-h-dvh bg-[#ffc091]">
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 overflow-clip pb-[170px] pt-[max(24px,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between px-4">
          <h1 className="font-display text-[32px] font-bold leading-10 tracking-[-0.64px] text-white">Earn</h1>
          <div className="flex items-center gap-1 rounded-full bg-white px-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kid-home/coin.svg" alt="" width={24} height={24} />
            <span className="font-display text-[15px] font-semibold leading-[19px] tracking-[-0.15px] text-black">25</span>
          </div>
        </header>
        <div className="flex flex-col gap-2.5 px-2">
          <TaskCard title="Special" timeLeft="18m left" progress={PROGRESS} tasks={TASKS} pinTop={PAGE_TOP} />
          <TaskCard title="Daily" timeLeft="18m left" progress={PROGRESS} tasks={TASKS} />
          <TaskCard title="Weekly" timeLeft="28 days left" urgent={false} progress={PROGRESS} tasks={TASKS} />
        </div>
      </div>
    </main>
  );
}
