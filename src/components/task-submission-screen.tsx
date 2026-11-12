"use client";

import { useState } from "react";
import {
  AppScreen,
  Button,
  Card,
  Status,
  useAction,
  useRemote,
} from "@/components/app-ui";
import {
  ChoreEvidenceReview,
  type ChoreSubmissionView,
} from "@/components/chore-proof-screen";
import { money } from "@/lib/app-types";
import { postApi } from "@/lib/client-api";

type TaskSubmission = ChoreSubmissionView & {
  child: { name: string };
  chore: { title: string; description: string | null; rewardAmount: string };
};

export function TaskSubmissionScreen({ id }: { id: string }) {
  const path = `/api/chore-submissions/${encodeURIComponent(id)}`;
  const remote = useRemote<TaskSubmission>(path, 0, true);
  const action = useAction();
  const [reviewed, setReviewed] = useState<ChoreSubmissionView | null>(null);
  const task = remote.error ? null : remote.data;
  const submission =
    task && reviewed?.id === task.id ? { ...task, ...reviewed } : task;

  function review(decision: "APPROVE" | "REJECT") {
    void action.run(async () => {
      const result = await postApi<{ submission: ChoreSubmissionView }>(
        `${path}/review`,
        { decision },
      );
      setReviewed(result.submission);
    }, decision === "APPROVE" ? "Reward approved." : "Asked to redo.");
  }

  return (
    <AppScreen
      title={task?.chore.title ?? "Task submission"}
      back="/approvals?tab=tasks"
      role="USER"
    >
      <Status
        loading={remote.loading}
        error={remote.error || action.error}
        notice={action.notice}
      />
      {submission && (
        <Card>
          <div>
            <p className="font-semibold">Submitted by {submission.child.name}</p>
            <p className="text-sm text-[#5e5e5e]">
              {new Date(submission.submittedAt).toLocaleString()}
            </p>
          </div>
          {submission.chore.description && <p>{submission.chore.description}</p>}
          {submission.rewardAmountPaid === null && (
            <p>Task reward {money(submission.chore.rewardAmount)}</p>
          )}
          <ChoreEvidenceReview submission={submission} />
          {submission.status === "PENDING" && (
            <div className="grid grid-cols-2 gap-3">
              <Button busy={action.busy} onClick={() => review("APPROVE")}>
                Approve reward
              </Button>
              <Button secondary busy={action.busy} onClick={() => review("REJECT")}>
                Ask to redo
              </Button>
            </div>
          )}
        </Card>
      )}
    </AppScreen>
  );
}
