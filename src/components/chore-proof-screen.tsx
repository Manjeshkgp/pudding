"use client";
import { ListEnd, usePagedList } from "@/components/paged-list";
import { useState } from "react";
import {
  AppScreen,
  Card,
  Button,
  Field,
  Status,
  useAction,
  useRemote,
} from "@/components/app-ui";
import { Me, money, readable } from "@/lib/app-types";
import { taskRewardSplit } from "@/lib/task-reward";
import { postApi, requestApi } from "@/lib/client-api";

type Evidence = {
  id: string;
  stage: string;
  createdAt: string;
  beforeSubmission: { id: string } | null;
  afterSubmission: { id: string } | null;
};
export type ChoreSubmissionView = {
  id: string;
  status: string;
  childNote?: string | null;
  beforeEvidenceId?: string | null;
  afterEvidenceId?: string | null;
  aiStatus: string;
  aiVerdict?: string | null;
  aiReason?: string | null;
  approvalSource?: string | null;
  rewardAmountPaid?: string | null;
  parentComment?: string | null;
  submittedAt: string;
};
export function ChoreEvidenceReview({
  submission: s,
}: {
  submission: ChoreSubmissionView;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        {readable(s.status)}
        {s.approvalSource === "AI" ? " · Automatically rewarded by AI" : ""}
      </p>
      {s.childNote && <p>{s.childNote}</p>}
      <div className="grid grid-cols-2 gap-3">
        {[
          ["Before", s.beforeEvidenceId],
          ["After", s.afterEvidenceId],
        ].map(([label, id]) => (
          <div key={label}>
            <p className="mb-1 text-sm font-semibold">{label}</p>
            {id ? (
              <img
                src={`/api/chore-evidence/${id}`}
                alt={`${label} task evidence`}
                loading="lazy"
                className="aspect-square w-full rounded-2xl object-cover"
              />
            ) : (
              <p className="text-sm text-[#5e5e5e]">No photo</p>
            )}
          </div>
        ))}
      </div>
      <p className="text-sm font-semibold">
        {s.aiStatus === "EVIDENCE_CHECKED" ? "Evidence check" : "Gemini"}:{" "}
        {s.aiStatus === "REVIEWING"
          ? "Reviewing photos…"
          : s.aiStatus === "UNAVAILABLE"
            ? "Unavailable — parent review needed"
            : s.aiVerdict
              ? readable(s.aiVerdict)
              : "Not reviewed"}
      </p>
      {s.aiReason && <p className="text-sm">{s.aiReason}</p>}
      {s.rewardAmountPaid && <p>Reward: {money(s.rewardAmountPaid)}</p>}
      {s.parentComment && <p>Parent: {s.parentComment}</p>}
      <p className="text-xs text-[#5e5e5e]">
        Photos can support visible progress; they cannot prove who did the work.
      </p>
    </div>
  );
}
async function resizedPhoto(file: File) {
  if (!file.type.startsWith("image/") || file.size > 12 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 12 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas"),
      scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare the photo. Please retry.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.75),
    );
    if (!blob || blob.size > 512 * 1024)
      throw new Error("Photo is too large. Please take a simpler photo.");
    return new File([blob], "task.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
export default function ChoreProofScreen({ id }: { id: string }) {
  const me = useRemote<Me>("/api/auth/me");
  const remote = useRemote<{
    title: string;
    description?: string;
    rewardAmount: string;
    isActive: boolean;
    periodStart: string | null;
    periodEndsAt: string | null;
  }>(`/api/chores/${id}?view=details`, 8000);
  const submissions = usePagedList<ChoreSubmissionView>(
    `/api/chore-submissions?choreId=${encodeURIComponent(id)}`,
  );
  const photos = useRemote<{ evidence: Evidence[] }>(
    `/api/chores/${id}/evidence`,
  );
  const [note, setNote] = useState("");
  const [localBefore, setBefore] = useState<Evidence | null>(null),
    [localAfter, setAfter] = useState<Evidence | null>(null);
  const action = useAction(),
    parent = me.data?.subjectType === "USER";
  const periodStart = remote.data?.periodStart;
  const periodEndsAt = remote.data?.periodEndsAt;
  const inPeriod = (date: string) =>
    !periodStart ||
    (date >= periodStart && (!periodEndsAt || date < periodEndsAt));
  const before =
    (localBefore && inPeriod(localBefore.createdAt) ? localBefore : null) ||
    photos.data?.evidence.find(
      (e) =>
        e.stage === "BEFORE" && !e.beforeSubmission && inPeriod(e.createdAt),
    );
  const after =
    (localAfter &&
    before &&
    localAfter.createdAt > before.createdAt &&
    inPeriod(localAfter.createdAt)
      ? localAfter
      : null) ||
    photos.data?.evidence.find(
      (e) =>
        e.stage === "AFTER" &&
        !e.afterSubmission &&
        inPeriod(e.createdAt) &&
        before &&
        e.createdAt > before.createdAt,
    );
  const alreadySubmitted = submissions.items.some(
    (s) =>
      inPeriod(s.submittedAt) && ["PENDING", "APPROVED"].includes(s.status),
  );
  async function upload(file: File, stage: "BEFORE" | "AFTER") {
    await action.run(
      async () => {
        const form = new FormData();
        form.set("file", await resizedPhoto(file));
        form.set("stage", stage);
        if (periodStart) form.set("periodStart", periodStart);
        const result = await requestApi<{ evidence: Evidence }>(
          `/api/chores/${id}/evidence`,
          { method: "POST", body: form },
        );
        if (stage === "BEFORE") {
          setBefore(result.evidence);
          setAfter(null);
        } else setAfter(result.evidence);
        photos.reload();
      },
      `${stage === "BEFORE" ? "Before" : "After"} photo saved.`,
    );
  }
  return (
    <AppScreen
      title={remote.data?.title || "Task evidence"}
      back={parent ? "/approvals?tab=tasks" : "/earn"}
      color={parent ? "#fff" : "#ffc091"}
    >
      <Status
        loading={remote.loading || me.loading}
        error={remote.error || photos.error || action.error}
        notice={action.notice}
      />
      {remote.data && (
        <Card>
          <p>{remote.data.description || "Show the result of your task."}</p>
          <p className="font-semibold">
            Reward: {money(remote.data.rewardAmount)}
          </p>
          {remote.data.isActive && (
            <p className="text-sm text-[#5e5e5e]">
              When you earn this reward, {taskRewardSplit.spend}% goes to Spend
              and {taskRewardSplit.save}% goes to Savings.
            </p>
          )}
          {remote.data.isActive && (
            <p className="text-sm text-[#5e5e5e]">
              {periodEndsAt
                ? `Submit by ${new Date(periodEndsAt).toLocaleString()}`
                : "No deadline"}
            </p>
          )}
        </Card>
      )}
      {!parent && remote.data?.isActive && !alreadySubmitted && (
        <Card>
          <h2 className="font-display text-2xl font-bold">
            Show your progress
          </h2>
          <p>
            Save a before photo, do the task, then take an after photo. Gemini
            checks the visible progress. A supported result earns your reward
            automatically; unclear evidence goes to your parent.
          </p>
          <p className="text-sm text-[#5e5e5e]">
            Only photograph the task, without people or private details. Photos
            are shared with Google for review.
          </p>
          {(["BEFORE", "AFTER"] as const).map((stage) => (
            <label
              key={stage}
              className="flex flex-col gap-2 rounded-3xl bg-[#f5f5f5] p-4"
            >
              <span className="font-semibold">
                {stage === "BEFORE"
                  ? "1. Before starting"
                  : "2. After finishing"}
              </span>
              {(stage === "BEFORE" ? before : after) && (
                <img
                  src={`/api/chore-evidence/${(stage === "BEFORE" ? before : after)?.id}`}
                  alt={`${stage.toLowerCase()} photo`}
                  className="max-h-48 rounded-2xl object-contain"
                />
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                disabled={action.busy || (stage === "AFTER" && !before)}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void upload(f, stage);
                }}
              />
            </label>
          ))}
          <Field
            label="What did you do?"
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            busy={action.busy}
            disabled={!before || !after || !note.trim()}
            onClick={() =>
              void action.run(async () => {
                await postApi(`/api/chores/${id}/submit`, {
                  beforeEvidenceId: before?.id,
                  afterEvidenceId: after?.id,
                  childNote: note,
                  periodStart,
                });
                setBefore(null);
                setAfter(null);
                setNote("");
                remote.reload();
                void submissions.reload();
                photos.reload();
              }, "Task submitted. See the review below.")
            }
          >
            Submit for AI review
          </Button>
        </Card>
      )}
      <h2 className="font-display text-xl font-bold">Submissions</h2>
      <Status loading={submissions.loading} error={submissions.error} />
      {submissions.items.map((s) => (
        <Card key={s.id}>
          <ChoreEvidenceReview submission={s} />
          {s.status === "PENDING" &&
            (["UNAVAILABLE", "NOT_REVIEWED", "REVIEWING"].includes(
              s.aiStatus,
            ) ||
              s.aiVerdict === "SUPPORTED") && (
              <Button
                secondary
                busy={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await postApi(
                      `/api/chore-submissions/${s.id}/ai-review`,
                      {},
                    );
                    remote.reload();
                    void submissions.reload();
                  }, "Review refreshed.")
                }
              >
                {s.aiVerdict === "SUPPORTED"
                  ? "Complete automatic reward"
                  : "Retry AI review"}
              </Button>
            )}
          {parent && s.status === "PENDING" && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                busy={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await postApi(`/api/chore-submissions/${s.id}/review`, {
                      decision: "APPROVE",
                    });
                    remote.reload();
                    void submissions.reload();
                  }, "Reward approved.")
                }
              >
                Approve reward
              </Button>
              <Button
                secondary
                busy={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await postApi(`/api/chore-submissions/${s.id}/review`, {
                      decision: "REJECT",
                    });
                    remote.reload();
                    void submissions.reload();
                  }, "Asked to redo.")
                }
              >
                Ask to redo
              </Button>
            </div>
          )}
        </Card>
      ))}
      <ListEnd list={submissions} />
    </AppScreen>
  );
}
