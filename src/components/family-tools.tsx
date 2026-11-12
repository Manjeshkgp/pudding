"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { frequencyLabels, taskFrequencies } from "@/lib/chore-period";
import { taskRewardSplit } from "@/lib/task-reward";
import { ListEnd, usePagedList } from "@/components/paged-list";
import { hasParentPermission } from "@/lib/co-parent-permissions";
import ChildAllowanceControls from "@/components/child-allowance-controls";
import {
  AppScreen,
  Card,
  Button,
  Field,
  Select,
  Status,
  Empty,
  ActionLink,
  useRemote,
  useAction,
} from "@/components/app-ui";
import { Kid, Chore, Me, money, readable } from "@/lib/app-types";
import { deleteApi, postApi, patchApi } from "@/lib/client-api";

type ManagedTask = Chore & {
  assigneeIds: string[];
  isActive: boolean;
  completed: boolean;
};

function TaskEditor({
  task,
  children,
  onClose,
  onSaved,
}: {
  task: ManagedTask | null;
  children: Kid[];
  onClose: () => void;
  onSaved: (updated?: Partial<ManagedTask>) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const action = useAction();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [reward, setReward] = useState(task?.rewardAmount ?? "");
  const [recurrence, setRecurrence] = useState(task?.recurrence ?? "ONCE");
  const [assigned, setAssigned] = useState(task?.assigneeIds ?? []);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const amount = Number(reward);
  const valid =
    title.trim().length >= 2 &&
    assigned.length > 0 &&
    reward !== "" &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    amount <= 1000;
  function save() {
    void action.run(async () => {
      const values = {
        title,
        description,
        rewardAmount: amount,
        recurrence,
        assigneeIds: assigned,
      };
      if (task) {
        const updated = await patchApi<Partial<ManagedTask>>(
          `/api/chores/${task.id}`,
          values,
        );
        onSaved(updated);
      } else {
        await postApi("/api/chores", values);
        onSaved();
      }
    });
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="task-editor-title"
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[460px] overflow-y-auto rounded-[32px] bg-white p-5 text-black shadow-xl backdrop:bg-black/50"
      onCancel={(event) => {
        event.preventDefault();
        if (!action.busy) onClose();
      }}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) save();
        }}
      >
        <h2 id="task-editor-title" className="font-display text-2xl font-bold">
          {task ? "Edit task" : "Create task"}
        </h2>
        <Field
          label="Task name"
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Field
          label="Instructions (optional)"
          value={description}
          maxLength={500}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Field
          label="Reward (USD)"
          type="number"
          min="0"
          max="1000"
          step="0.01"
          value={reward}
          onChange={(event) => setReward(event.target.value)}
        />
        <p className="text-sm text-[#5e5e5e]">
          Task rewards go {taskRewardSplit.spend}% to Spend allowance and{" "}
          {taskRewardSplit.save}% to Savings.
        </p>
        <Select label="Repeat" value={recurrence} onChange={setRecurrence}>
          {taskFrequencies.map((option) => (
            <option key={option} value={option}>
              {frequencyLabels[option]}
            </option>
          ))}
        </Select>
        <p className="text-sm text-[#5e5e5e]">
          {recurrence === "ONCE"
            ? "One-time tasks have no deadline."
            : "Each repeat has its own deadline. Missed periods cannot be made up."}
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">Assign to</legend>
          {children.length === 0 && <p>Add a child before creating a task.</p>}
          {children.map((child) => (
            <label key={child.id} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={assigned.includes(child.id)}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setAssigned((ids) =>
                    checked
                      ? [...ids, child.id]
                      : ids.filter((id) => id !== child.id),
                  );
                }}
              />
              {child.name}
            </label>
          ))}
        </fieldset>
        <Status error={action.error} />
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            secondary
            disabled={action.busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" busy={action.busy} disabled={!valid}>
            {task ? "Save changes" : "Create task"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

export function ChoresScreen() {
  const kids = useRemote<{ children: Kid[] }>("/api/children");
  const me = useRemote<Me>("/api/auth/me");
  const tasks = usePagedList<ManagedTask>("/api/chores?view=manage");
  const action = useAction();
  const [editor, setEditor] = useState<ManagedTask | "new" | null>(null);
  const canManage = hasParentPermission(me.data?.user, "canApproveChores");
  return (
    <AppScreen title="Manage tasks" role="USER">
      <ActionLink href="/approvals?tab=tasks">Review submissions</ActionLink>
      {canManage && (
        <Button disabled={kids.loading} onClick={() => setEditor("new")}>
          Create task +
        </Button>
      )}
      <Status
        loading={tasks.loading}
        error={kids.error || me.error || tasks.error || action.error}
        notice={action.notice}
      />
      {!tasks.loading && !tasks.error && !tasks.items.length && (
        <Empty>Your family’s tasks will appear here.</Empty>
      )}
      {tasks.items.map((task) => (
        <Card key={task.id}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-xl font-bold">{task.title}</h2>
            <span className="shrink-0 rounded-full bg-[#f3f3f3] px-3 py-1 text-xs font-semibold">
              {task.completed
                ? "Completed"
                : task.isActive
                  ? "Active"
                  : "Paused"}
            </span>
          </div>
          <p>
            {money(task.rewardAmount)} ·{" "}
            {frequencyLabels[task.recurrence as keyof typeof frequencyLabels] ||
              readable(task.recurrence)}
          </p>
          {task.description && (
            <p className="text-sm text-[#5e5e5e]">{task.description}</p>
          )}
          {canManage && (!task.completed || task.recurrence === "ONCE") && (
            <div className="grid grid-cols-2 gap-2">
              {!task.completed && (
                <Button
                  secondary
                  disabled={kids.loading || action.busy}
                  onClick={() => setEditor(task)}
                >
                  Edit
                </Button>
              )}
              <Button
                secondary
                busy={action.busy}
                onClick={() => {
                  if (task.recurrence === "ONCE") {
                    if (!window.confirm(`Delete “${task.title}”? Existing submissions will stay in the review history.`)) return;
                    void action.run(async () => {
                      await deleteApi(`/api/chores/${task.id}`);
                      tasks.updateItems((items) => items.filter((item) => item.id !== task.id));
                    }, "Task deleted.");
                    return;
                  }
                  void action.run(
                    async () => {
                      await patchApi(`/api/chores/${task.id}`, {
                        isActive: !task.isActive,
                      });
                      tasks.updateItems((items) =>
                        items.map((item) =>
                          item.id === task.id
                            ? { ...item, isActive: !task.isActive }
                            : item,
                        ),
                      );
                    },
                    task.isActive ? "Task paused." : "Task resumed.",
                  );
                }}
              >
                {task.recurrence === "ONCE" ? "Delete" : task.isActive ? "Pause" : "Resume"}
              </Button>
            </div>
          )}
        </Card>
      ))}
      <ListEnd list={tasks} />
      {editor && (
        <TaskEditor
          key={editor === "new" ? "new" : editor.id}
          task={editor === "new" ? null : editor}
          children={kids.data?.children ?? []}
          onClose={() => setEditor(null)}
          onSaved={(updated) => {
            setEditor(null);
            if (updated) {
              tasks.updateItems((items) =>
                items.map((item) =>
                  item.id === updated.id ? { ...item, ...updated } : item,
                ),
              );
            } else {
              void tasks.reload();
            }
          }}
        />
      )}
    </AppScreen>
  );
}

export function AllowancesScreen({
  linkedChildId,
}: {
  linkedChildId?: string;
}) {
  const me = useRemote<Me>("/api/auth/me");
  const kids = useRemote<{ children: Kid[] }>("/api/children");
  const [selectedId, setSelectedId] = useState("");
  const childId = linkedChildId || selectedId;
  const child = kids.data?.children.find((kid) => kid.id === childId);
  const title =
    linkedChildId && child ? `${child.name}’s allowance` : "Allowance";
  const missingChild = linkedChildId && kids.data && !child;
  return (
    <AppScreen title={title} role="USER">
      <Status
        loading={kids.loading || me.loading}
        error={
          kids.error ||
          me.error ||
          (missingChild ? "Child not found." : undefined)
        }
      />
      {!linkedChildId && (
        <Card>
          <Select
            label="Child"
            value={selectedId}
            onChange={(value) => setSelectedId(value)}
          >
            <option value="">Select a child</option>
            {kids.data?.children.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </Select>
        </Card>
      )}
      {child && (
        <ChildAllowanceControls
          key={child.id}
          id={child.id}
          user={me.data?.user}
        />
      )}
    </AppScreen>
  );
}
type Goal = {
  id: string;
  childId: string;
  child?: { name: string };
  name: string;
  targetAmount: string;
  currentAmount: string;
  status: string;
  isLocked: boolean;
};
export function GoalsScreen() {
  const me = useRemote<Me>("/api/auth/me");
  const action = useAction();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [childId, setChildId] = useState("");
  const child = me.data?.subjectType === "CHILD";
  const remote = usePagedList<Goal>(
    `/api/goals?view=feed${childId ? `&childId=${encodeURIComponent(childId)}` : ""}`,
  );
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("childId");
    if (id) setChildId(id);
  }, []);
  return (
    <AppScreen
      title={child ? "Your quests" : "Savings goals"}
      back={child ? "/home" : "/family"}
      color="#a0e1e1"
    >
      <Status
        loading={me.loading || remote.loading}
        error={me.error || remote.error || action.error}
        notice={action.notice}
      />
      <Card>
        <div className="flex items-center gap-3">
          <img src="/kid-home/quest.svg" alt="" className="size-16" />
          <div>
            <h2 className="font-display text-2xl font-bold">
              Make a little goal
            </h2>
            <p className="text-[#5e5e5e]">Small steps, something big.</p>
          </div>
        </div>
        {!child && (
          <Select
            label="Child"
            value={childId}
            onChange={(value) => setChildId(value)}
          >
            <option value="">Select a child</option>
            {me.data?.family.children?.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </Select>
        )}
        <Field
          label="What are you saving for?"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Goal amount (USD)"
          type="number"
          min="0.01"
          max="50000"
          step="0.01"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <Button
          busy={action.busy}
          disabled={
            name.trim().length < 2 ||
            !(Number(target) > 0) ||
            (!child && !childId)
          }
          onClick={() =>
            void action.run(async () => {
              await postApi("/api/goals", {
                name,
                targetAmount: Number(target),
                ...(child ? {} : { childId }),
              });
              setName("");
              setTarget("");
              remote.reload();
            }, "Your new goal is ready.")
          }
        >
          Create goal
        </Button>
      </Card>
      {!remote.loading && !remote.error && remote.items.length === 0 && (
        <Empty>No goals yet. Dream up your first one above.</Empty>
      )}
      {remote.items.map((g) => (
        <Card key={g.id}>
          <p className="text-sm text-[#5e5e5e]">{g.child?.name}</p>
          <h2 className="font-display text-2xl font-bold">{g.name}</h2>
          <p>
            {money(g.currentAmount)} of {money(g.targetAmount)}
          </p>
          <progress
            className="h-3 w-full accent-black"
            value={Number(g.currentAmount)}
            max={Number(g.targetAmount)}
          />
          <ActionLink href={`/goals/${g.id}`}>View goal</ActionLink>
        </Card>
      ))}
      <ListEnd list={remote} />
    </AppScreen>
  );
}
export function GoalDetail({ id }: { id: string }) {
  const me = useRemote<Me>("/api/auth/me");
  const remote = useRemote<Goal>(`/api/goals/${id}`);
  const action = useAction();
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("SAVE_BUCKET");
  const key = useRef<string | null>(null);
  const g = remote.data;
  return (
    <AppScreen
      title={g?.name || "Your goal"}
      back={me.data?.subjectType === "CHILD" ? "/quest" : "/goals"}
      color="#a0e1e1"
    >
      <Status
        loading={remote.loading}
        error={remote.error || me.error || action.error}
        notice={action.notice}
      />
      {g && (
        <>
          <Card>
            <img src="/kid-home/savings.svg" alt="" className="size-20" />
            <h2 className="font-display text-4xl font-bold">
              {money(g.currentAmount)}
            </h2>
            <p>Saved toward {money(g.targetAmount)}</p>
            <progress
              className="h-3 w-full accent-black"
              value={Number(g.currentAmount)}
              max={Number(g.targetAmount)}
            />
            <p>
              {g.isLocked
                ? "Parent-locked savings"
                : "Your savings, one step at a time"}
            </p>
          </Card>
          <Card>
            <h2 className="font-display text-xl font-bold">Add to your goal</h2>
            <Field
              label="Amount (USD)"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                key.current = null;
              }}
            />
            <Select
              label="From"
              value={source}
              onChange={(value) => {
                setSource(value);
                key.current = null;
              }}
            >
              <option value="SAVE_BUCKET">Save wallet</option>
              <option value="SPEND_BUCKET">Spend wallet</option>
              {me.data?.subjectType === "USER" && (
                <option value="PARENT_CONTRIBUTION">
                  Family unallocated budget
                </option>
              )}
            </Select>
            <Button
              busy={action.busy}
              disabled={!(Number(amount) > 0)}
              onClick={() =>
                void action.run(async () => {
                  key.current ||= crypto.randomUUID();
                  await postApi(`/api/goals/${id}/deposit`, {
                    amount: Number(amount),
                    source,
                    idempotencyKey: key.current,
                  });
                  setAmount("");
                  key.current = null;
                  remote.reload();
                }, "Savings added.")
              }
            >
              Save toward goal
            </Button>
            <Button
              secondary
              busy={action.busy}
              disabled={Number(g.currentAmount) <= 0}
              onClick={() =>
                void action.run(async () => {
                  await postApi(`/api/goals/${id}/withdraw`, {
                    destinationBucket: "SAVE",
                    idempotencyKey: crypto.randomUUID(),
                  });
                  remote.reload();
                }, "Savings returned to the Save wallet.")
              }
            >
              {g.isLocked && me.data?.subjectType === "CHILD"
                ? "Ask parent to unlock"
                : "Return savings to wallet"}
            </Button>
          </Card>
        </>
      )}
    </AppScreen>
  );
}
