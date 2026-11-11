"use client";
import { ListEnd, usePagedList } from "@/components/paged-list";
import {
  AppScreen,
  Card,
  Status,
  Empty,
  ActionLink,
} from "@/components/app-ui";
export default function CoparentInvitationsScreen() {
  const remote = usePagedList<{
    id: string;
    family: { name: string };
    inviteToken: string;
  }>("/api/family/invitations");
  return (
    <AppScreen title="Your invitations" back="/coparent" role="USER">
      <Status loading={remote.loading} error={remote.error} />
      {!remote.loading && !remote.error && remote.items.length === 0 && (
        <Empty>No active co-parent invitations for your email.</Empty>
      )}
      {remote.items.map((i) => (
        <Card key={i.id}>
          <p>{i.family.name}</p>
          <ActionLink
            href={`/accept-invite?token=${encodeURIComponent(i.inviteToken)}`}
          >
            View invitation
          </ActionLink>
        </Card>
      ))}
      <ListEnd list={remote} />
    </AppScreen>
  );
}
