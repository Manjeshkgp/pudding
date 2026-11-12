"use client";
import { ListEnd, usePagedList } from "@/components/paged-list";
import { useEffect, useRef, useState } from "react";
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

type Evidence = { id: string; createdAt: string };
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
        {s.status === "PENDING" && s.aiStatus !== "REVIEWING"
          ? "Waiting for parent review"
          : readable(s.status)}
        {s.approvalSource === "AI" ? " · Automatically rewarded by AI" : ""}
      </p>
      {s.childNote && <p>{s.childNote}</p>}
      {(s.beforeEvidenceId || s.afterEvidenceId) && (
        <div
          className={
            s.beforeEvidenceId && s.afterEvidenceId ? "grid grid-cols-2 gap-3" : undefined
          }
        >
          {[
            ["Before", s.beforeEvidenceId],
            [s.beforeEvidenceId ? "After" : "Task photo", s.afterEvidenceId],
          ].map(([label, id]) =>
            id && (
              <div key={label}>
                <p className="mb-1 text-sm font-semibold">{label}</p>
                <img
                  src={`/api/chore-evidence/${id}`}
                  alt={`${label} task evidence`}
                  loading="lazy"
                  className="max-h-80 w-full rounded-2xl object-contain"
                />
              </div>
            ),
          )}
        </div>
      )}
      {s.aiStatus === "REVIEWING" && <p className="text-sm">Reviewing photo…</p>}
      {s.aiReason && <p className="text-sm">{s.aiReason}</p>}
      {s.rewardAmountPaid && <p>Reward: {money(s.rewardAmountPaid)}</p>}
      {s.parentComment && <p>Parent: {s.parentComment}</p>}
    </div>
  );
}

async function capturePhoto(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to prepare the photo. Please retry.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.75),
  );
  if (!blob || blob.size > 512 * 1024)
    throw new Error("Photo is too large. Please retake it.");
  return blob;
}

function TaskCamera({
  busy,
  onCapture,
  onClose,
}: {
  busy: boolean;
  onCapture: (video: HTMLVideoElement) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const preview = video.current;
    if (!preview) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Open Pudding on HTTPS or localhost to use your camera.");
      return;
    }
    let active = true;
    let stream: MediaStream | undefined;
    void navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    }).then((opened) => {
      if (active) {
        stream = opened;
        preview.srcObject = opened;
      } else {
        opened.getTracks().forEach((track) => track.stop());
      }
    }).catch(() => {
      if (active) setError("Camera unavailable. Check your browser permissions and reopen it.");
    });
    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
      preview.srcObject = null;
    };
  }, []);

  return (
    <>
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        onPlaying={() => setReady(true)}
        aria-label="Live camera preview"
        className="aspect-[4/3] w-full rounded-2xl bg-black object-contain"
      />
      <Status error={error} loading={!error && !ready} />
      <div className="grid grid-cols-2 gap-2">
        <Button secondary disabled={busy} onClick={onClose}>Close camera</Button>
        <Button busy={busy} disabled={!ready} onClick={() => {
          if (video.current?.videoWidth) onCapture(video.current);
        }}>
          Take photo
        </Button>
      </div>
    </>
  );
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
  }>(`/api/chores/${id}?view=details`, 0, true);
  const submissions = usePagedList<ChoreSubmissionView>(
    `/api/chore-submissions?choreId=${encodeURIComponent(id)}`,
  );
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<Evidence | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const action = useAction();
  const parent = me.data?.subjectType === "USER";
  const periodStart = remote.data?.periodStart;
  const periodEndsAt = remote.data?.periodEndsAt;
  const reloadTask = remote.reload;
  useEffect(() => {
    if (!periodEndsAt) return;
    const delay = new Date(periodEndsAt).getTime() - Date.now();
    if (delay > 0 && delay + 50 <= 2_147_483_647) {
      const timer = window.setTimeout(reloadTask, delay + 50);
      return () => window.clearTimeout(timer);
    }
  }, [periodEndsAt, reloadTask]);
  const inPeriod = (date: string) =>
    !periodStart ||
    (date >= periodStart && (!periodEndsAt || date < periodEndsAt));
  const currentPhoto = photo && inPeriod(photo.createdAt) ? photo : null;
  const alreadySubmitted = submissions.items.some(
    (s) =>
      inPeriod(s.submittedAt) && ["PENDING", "APPROVED"].includes(s.status),
  );
  const canSubmit =
    me.data?.subjectType === "CHILD" &&
    remote.data?.isActive &&
    !submissions.loading &&
    !submissions.error &&
    !alreadySubmitted;
  function takePhoto(video: HTMLVideoElement) {
    void action.run(async () => {
      const form = new FormData();
      form.set("file", await capturePhoto(video), "task.jpg");
      if (periodStart) form.set("periodStart", periodStart);
      try {
        const result = await requestApi<{ evidence: Evidence }>(
          `/api/chores/${id}/evidence`,
          { method: "POST", body: form },
        );
        setPhoto(result.evidence);
        setCameraOpen(false);
      } finally {
        remote.reload();
      }
    });
  }
  return (
    <AppScreen
      title={remote.data?.title || "Task evidence"}
      back={parent ? "/approvals?tab=tasks" : "/earn"}
      color={parent ? "#fff" : "#ffc091"}
    >
      <Status
        loading={remote.loading || me.loading}
        error={remote.error || action.error}
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
      {canSubmit && (
        <Card>
          <h2 className="font-display text-2xl font-bold">Show your finished task</h2>
          <p>
            Take one photo of the result. If it supports completion, you’ll earn
            your reward automatically. Otherwise, your parent can review it.
          </p>
          <p className="text-sm text-[#5e5e5e]">
            Keep people and private details out of the photo. Google processes
            it for review.
          </p>
          {cameraOpen ? (
            <TaskCamera
              busy={action.busy}
              onCapture={takePhoto}
              onClose={() => setCameraOpen(false)}
            />
          ) : (
            <>
              {currentPhoto && (
                <img
                  src={`/api/chore-evidence/${currentPhoto.id}`}
                  alt="Your task photo"
                  className="max-h-48 rounded-2xl object-contain"
                />
              )}
              <Button
                secondary
                disabled={action.busy}
                onClick={() => setCameraOpen(true)}
              >
                {currentPhoto ? "Retake photo" : "Open camera"}
              </Button>
            </>
          )}
          <Field
            label="What did you do?"
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            busy={action.busy}
            disabled={!currentPhoto || cameraOpen || !note.trim()}
            onClick={() =>
              void action.run(async () => {
                await postApi(`/api/chores/${id}/submit`, {
                  afterEvidenceId: currentPhoto?.id,
                  childNote: note,
                  periodStart,
                });
                setPhoto(null);
                setNote("");
                remote.reload();
                void submissions.reload();
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
