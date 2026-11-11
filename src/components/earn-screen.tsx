"use client";
import { ListEnd, usePagedList } from "@/components/paged-list";
import TaskCard from "@/components/task-card";
import { useRemote, Status, Empty } from "@/components/app-ui";
import { Chore, Me, money } from "@/lib/app-types";
import { useRouter } from "next/navigation";
export default function EarnScreen() {
  const me = useRemote<Me & { child?: { xp?: number } }>("/api/auth/me");
  const remote = usePagedList<Chore>("/api/chores?view=assigned");
  const router = useRouter();
  const groups = [
    { title: "Special", recurrence: "ONCE" },
    { title: "Daily", recurrence: "DAILY" },
    { title: "Weekly", recurrence: "WEEKLY" },
    { title: "Every two weeks", recurrence: "BIWEEKLY" },
    { title: "Monthly", recurrence: "MONTHLY" },
  ];
  return (
    <main className="min-h-dvh bg-[#ffc091]">
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 pb-[170px] pt-[max(24px,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between px-4">
          <h1 className="font-display text-[32px] font-bold text-white">
            Earn
          </h1>
          <span className="rounded-full bg-white px-4 py-2">
            {me.data?.child?.xp || 0} XP
          </span>
        </header>
        <div className="px-4">
          <Status loading={remote.loading} error={remote.error} />
          <p>
            Open a task to capture before and after photos for Gemini review.
          </p>
        </div>
        <div className="flex flex-col gap-3 px-2">
          {groups.map((g) => {
            const chores =
              remote.items.filter((c) => c.recurrence === g.recurrence) || [];
            if (!chores.length) return null;
            const tasks = chores.map((c) => ({
              id: c.id,
              icon: "/kid-home/task-wand.svg",
              title: c.title,
              reward: money(c.rewardAmount),
              status: c.latestSubmission?.status,
              submitted: ["PENDING", "APPROVED"].includes(
                c.latestSubmission?.status || "",
              ),
            }));
            return (
              <TaskCard
                key={g.title}
                title={g.title}
                timeLeft={`${tasks.length} tasks`}
                urgent={false}
                progress={{
                  done: tasks.filter((t) => t.submitted).length,
                  total: tasks.length,
                }}
                tasks={tasks}
                onSubmit={(id) => router.push(`/chores/${id}/proof`)}
              />
            );
          })}
          {!remote.loading && !remote.error && remote.items.length === 0 && (
            <Empty>No tasks yet. Ask your parent to add one.</Empty>
          )}
          <ListEnd list={remote} />
        </div>
      </div>
    </main>
  );
}
