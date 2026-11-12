"use client";
import { ListEnd, usePagedList } from "@/components/paged-list";
import { useRef } from "react";
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
import { patchApi, requestApi } from "@/lib/client-api";
import { taskSubmissionPath } from "@/lib/navigation-policy";
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
      goalId?: string;
      submissionId?: string;
    } | null;
  }>("/api/notifications");
  const action = useAction();
  const marking = useRef(new Set<string>());
  function showRead(id: string) {
    remote.updateItems(
      (items) =>
        items.map((item) =>
          item.id === id ? { ...item, isRead: true } : item,
        ),
      (count) => (count === undefined ? undefined : Math.max(0, count - 1)),
    );
  }
  function markOpened(notification: { id: string; isRead: boolean }) {
    if (notification.isRead || marking.current.has(notification.id)) return;
    marking.current.add(notification.id);
    void requestApi("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationIds: [notification.id] }),
      keepalive: true,
    })
      .then(() => showRead(notification.id))
      .catch(() =>
        action.setError("Couldn’t mark this message as read. Try again."),
      )
      .finally(() => marking.current.delete(notification.id));
  }
  return (
    <AppScreen
      title="Your inbox"
      back={me.data?.subjectType === "CHILD" ? "/home" : "/family"}
    >
      <Status loading={remote.loading} error={remote.error || action.error} />
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
      {remote.items.map((n) => (
        <Card
          key={n.id}
          className={n.isRead ? "" : "border-black bg-[#fff9db]"}
        >
          <p className="text-xs text-[#5e5e5e]">
            {new Date(n.createdAt).toLocaleString()}
          </p>
          <h2 className="font-display text-xl font-bold">{n.title}</h2>
          <p>{n.message}</p>
          {n.metadata?.purchaseId && (
            <ActionLink
              href={`/purchases/${n.metadata.purchaseId}`}
              onClick={() => markOpened(n)}
            >
              View invoice
            </ActionLink>
          )}
          {n.metadata?.goalId && (
            <ActionLink
              href={`/goals/${n.metadata.goalId}`}
              onClick={() => markOpened(n)}
            >
              View savings goal
            </ActionLink>
          )}
          {n.metadata?.submissionId && me.data?.subjectType === "USER" && (
            <ActionLink
              href={taskSubmissionPath(n.metadata.submissionId)}
              onClick={() => markOpened(n)}
            >
              Review task
            </ActionLink>
          )}
          {!n.isRead && (
            <button
              className="self-start text-sm underline"
              onClick={() =>
                void action.run(async () => {
                  await patchApi("/api/notifications", {
                    notificationIds: [n.id],
                  });
                  showRead(n.id);
                })
              }
            >
              Mark as read
            </button>
          )}
        </Card>
      ))}
      <ListEnd list={remote} />
    </AppScreen>
  );
}
