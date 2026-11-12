"use client";
import { ListEnd, usePagedList } from "@/components/paged-list";
import {
  useRemote,
  useAction,
  AppScreen,
  Card,
  Status,
  Button,
  Empty,
  ActionLink,
} from "@/components/app-ui";
import { Me } from "@/lib/app-types";
import { patchApi } from "@/lib/client-api";
import { taskSubmissionPath } from "@/lib/navigation-policy";
import { purchaseReviewPath } from "@/lib/purchase-review";
import { enableWebPush } from "@/lib/web-push-client";
export default function InboxScreen() {
  const me = useRemote<Me>("/api/auth/me");
  const remote = usePagedList<{
    id: string;
    title: string;
    message: string;
    isRead: boolean;
    createdAt: string;
    metadata: {
      purchaseId?: string;
      href?: string;
      goalId?: string;
      submissionId?: string;
    } | null;
  }>("/api/notifications");
  const action = useAction();
  const push = useAction();
  return (
    <AppScreen
      title="Your inbox"
      back={me.data?.subjectType === "CHILD" ? "/home" : "/family"}
    >
      <Status loading={remote.loading} error={remote.error || action.error} />
      {me.data?.subjectType === "CHILD" && (
        <>
          <Button
            secondary
            busy={push.busy}
            onClick={() => void push.run(
              () => enableWebPush(),
              "Browser notifications are enabled on this device.",
            )}
          >
            Enable browser notifications
          </Button>
          <Status error={push.error} notice={push.notice} />
        </>
      )}
      {Boolean(remote.unreadCount) && (
        <Button
          secondary
          busy={action.busy}
          onClick={() =>
            void action.run(async () => {
              await patchApi("/api/notifications", { markAllRead: true });
              remote.updateItems(
                (items) => items.map((item) => ({ ...item, isRead: true })),
                () => 0,
              );
            })
          }
        >
          Mark all as read
        </Button>
      )}
      {!remote.loading && !remote.error && remote.items.length === 0 && (
        <Empty>Your updates will appear here.</Empty>
      )}
      {remote.items.map((n) => {
        const purchaseId = n.metadata?.purchaseId;
        const reviewPath = purchaseId ? purchaseReviewPath(purchaseId) : null;
        const review =
          me.data?.subjectType === "USER" &&
          reviewPath &&
          (n.metadata?.href === reviewPath ||
            [
              "Purchase needs approval",
              "Purchase needs your attention",
              "AI blocked a purchase",
            ].includes(n.title));
        return (
          <Card
            key={n.id}
            className={n.isRead ? "" : "border-black bg-[#fff9db]"}
          >
            <p className="text-xs text-[#5e5e5e]">
              {new Date(n.createdAt).toLocaleString()}
            </p>
            <h2 className="font-display text-xl font-bold">{n.title}</h2>
            <p>{n.message}</p>
            {purchaseId && (
              <ActionLink
                href={review ? reviewPath : `/purchases/${purchaseId}`}
              >
                {review
                  ? "Review purchase request"
                  : n.title === "Purchase paid"
                    ? "View invoice"
                    : "View purchase"}
              </ActionLink>
            )}
            {n.metadata?.goalId && (
              <ActionLink
                href={`/goals/${n.metadata.goalId}`}
              >
                View savings goal
              </ActionLink>
            )}
            {n.metadata?.submissionId && me.data?.subjectType === "USER" && (
              <ActionLink
                href={taskSubmissionPath(n.metadata.submissionId)}
              >
                Review task
              </ActionLink>
            )}
          </Card>
        );
      })}
      <ListEnd list={remote} />
    </AppScreen>
  );
}
