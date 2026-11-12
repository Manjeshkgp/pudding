"use client";
import { ListEnd, usePagedList } from "@/components/paged-list";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AppScreen,
  Card,
  Button,
  Status,
  Empty,
  ActionLink,
  useRemote,
  useAction,
} from "@/components/app-ui";
import { Me } from "@/lib/app-types";
import { patchApi, deleteApi, postApi } from "@/lib/client-api";
type CoParent = {
  id: string;
  name: string;
  email: string;
  role: string;
  permissionLevel: string;
};
type Invite = {
  id: string;
  email: string;
  name: string;
  inviteToken?: string;
  status: "PENDING" | "EXPIRED";
  expiresAt: string;
};
export default function CoparentScreen() {
  const router = useRouter();
  const remote = useRemote<{ parents: CoParent[] }>(
    "/api/family/co-parents?view=parents",
  );
  const me = useRemote<Me>("/api/auth/me");
  const action = useAction();
  const [removing, setRemoving] = useState("");
  const owner = me.data?.user?.role === "PRIMARY_PARENT";
  const invites = usePagedList<Invite>(
    owner ? "/api/family/co-parents?view=invites" : null,
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const next = invites.items.reduce((earliest, invite) => {
      const end = Date.parse(invite.expiresAt);
      return invite.status === "PENDING" && end > now
        ? Math.min(earliest, end)
        : earliest;
    }, Infinity);
    if (!Number.isFinite(next)) return;
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(1, next - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [invites.items, now]);

  function resend(id: string) {
    void action.run(async () => {
      const result = await postApi<{
        invite: { email: string; inviteAcceptUrl: string };
        delivery: { delivered: boolean };
      }>(`/api/family/co-parents/${id}/resend`, {});
      const link = new URL(result.invite.inviteAcceptUrl);
      sessionStorage.setItem(
        "pudding-last-invite",
        JSON.stringify({
          email: result.invite.email,
          url: `${window.location.origin}${link.pathname}${link.search}`,
          delivered: result.delivery.delivered,
        }),
      );
      router.push("/coparent/sent");
    });
  }
  return (
    <AppScreen title="Co-parent" role="USER">
      <Status
        loading={remote.loading || me.loading || invites.loading}
        error={remote.error || me.error || invites.error || action.error}
        notice={action.notice}
      />
      <p>Share the day-to-day care of your family's money habits.</p>
      {owner && <ActionLink href="/coparent/add">Add a co-parent</ActionLink>}
      {remote.data?.parents.filter((p) => p.role === "CO_PARENT").length ===
        0 && <Empty>No co-parent has joined your family yet.</Empty>}
      {remote.data?.parents
        .filter((p) => p.role === "CO_PARENT")
        .map((p) => (
          <Card key={p.id}>
            <h2 className="font-display text-xl font-bold">{p.name}</h2>
            <p>{p.email}</p>
            <p>
              {p.permissionLevel === "EQUAL"
                ? "Full family access"
                : "Limited family access"}
            </p>
            {owner && (
              <>
                <Button
                  secondary
                  busy={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      await patchApi("/api/family/co-parents", {
                        coParentUserId: p.id,
                        permissionLevel:
                          p.permissionLevel === "EQUAL" ? "LIMITED" : "EQUAL",
                      });
                      remote.reload();
                    }, "Access updated.")
                  }
                >
                  {p.permissionLevel === "EQUAL"
                    ? "Switch to limited access"
                    : "Give full access"}
                </Button>
                {removing === p.id ? (
                  <>
                    <p>Remove {p.name} from this family?</p>
                    <Button
                      busy={action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          await deleteApi(
                            `/api/family/co-parents?coParentUserId=${p.id}`,
                          );
                          setRemoving("");
                          remote.reload();
                        }, "Co-parent removed.")
                      }
                    >
                      Confirm removal
                    </Button>
                    <Button secondary onClick={() => setRemoving("")}>
                      Keep co-parent
                    </Button>
                  </>
                ) : (
                  <Button secondary onClick={() => setRemoving(p.id)}>
                    Remove co-parent
                  </Button>
                )}
              </>
            )}
          </Card>
        ))}
      {invites.items.map((i) => {
        const expired =
          i.status === "EXPIRED" || Date.parse(i.expiresAt) <= now;
        return (
          <Card key={i.id}>
            <p className="font-semibold">{i.name}</p>
            <p>{i.email}</p>
            <p className="text-sm text-[#5e5e5e]">
              {expired
                ? "Invitation expired"
                : `Expires ${new Date(i.expiresAt).toLocaleString()}`}
            </p>
            {expired ? (
              <Button busy={action.busy} onClick={() => resend(i.id)}>
                Resend invite
              </Button>
            ) : (
              i.inviteToken && (
                <Button
                  secondary
                  busy={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      await navigator.clipboard.writeText(
                        `${window.location.origin}/accept-invite?token=${i.inviteToken}`,
                      );
                    }, "Invitation link copied.")
                  }
                >
                  Copy invitation link
                </Button>
              )
            )}
            <Button
              secondary
              busy={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await deleteApi(`/api/family/co-parents?inviteId=${i.id}`);
                  invites.updateItems((items) =>
                    items.filter((item) => item.id !== i.id),
                  );
                }, "Invitation removed.")
              }
            >
              Remove invitation
            </Button>
          </Card>
        );
      })}
      <ListEnd list={invites} />
    </AppScreen>
  );
}
