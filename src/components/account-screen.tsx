"use client";
import { useState } from "react";
import {
  AppScreen,
  Card,
  ActionLink,
  Button,
  Status,
  useRemote,
  useAction,
} from "@/components/app-ui";
import LogoutSheet from "@/components/logout-sheet";
import { Me } from "@/lib/app-types";
import { AVATARS } from "@/components/avatar-sheet";
export default function AccountScreen() {
  const remote = useRemote<Me>("/api/auth/me");
  const action = useAction();
  const [logout, setLogout] = useState(false);
  const me = remote.data;
  const parent = me?.subjectType === "USER";
  const identity = parent ? me?.user : me?.child;
  const avatar =
    AVATARS[Number(identity?.avatar.replace("avatar-", "")) - 1] || AVATARS[0];
  return (
    <AppScreen title="Accounts" back={parent ? "/family" : "/home"}>
      <Status
        loading={remote.loading}
        error={remote.error || action.error}
        notice={action.notice}
      />
      {identity && (
        <>
          <Card>
            <div className="flex items-center gap-3">
              <img
                src={avatar.src}
                alt=""
                className="size-16 rounded-full"
                style={{ backgroundColor: avatar.bg }}
              />
              <div>
                <h2 className="font-display text-2xl font-bold">
                  {identity.name}
                </h2>
                <p className="text-sm text-[#5e5e5e]">
                  {parent ? me?.user?.email : me?.child?.username}
                </p>
              </div>
            </div>
            {parent && (
              <ActionLink href="/account/profile">Edit your profile</ActionLink>
            )}
          </Card>
          {parent && (
            <>
              <ActionLink href="/children">
                Manage children ({me?.family.children?.length || 0})
              </ActionLink>
              <ActionLink href="/coparent">Co-parent</ActionLink>
              <ActionLink href="/account/security">Security & PIN</ActionLink>
              <ActionLink href="/account/preferences">
                Notification preferences
              </ActionLink>
              <ActionLink href="/account/paypal">PayPal wallet</ActionLink>
            </>
          )}
          <ActionLink href="/inbox">Inbox</ActionLink>
          <ActionLink href="/help">Help & support</ActionLink>
          {parent && <ActionLink href="/support">Contact support</ActionLink>}
          <Button
            secondary
            onClick={() =>
              void action.run(async () => {
                if (navigator.share)
                  await navigator.share({
                    title: "Pudding",
                    text: "Explore Pudding's family money demo",
                    url: window.location.origin,
                  });
                else {
                  await navigator.clipboard.writeText(window.location.origin);
                }
              }, "Share link ready.")
            }
          >
            Share Pudding
          </Button>
          <ActionLink href="/about">About Pudding</ActionLink>
          <Button secondary onClick={() => setLogout(true)}>
            Log out
          </Button>
        </>
      )}
      <LogoutSheet open={logout} onClose={() => setLogout(false)} />
    </AppScreen>
  );
}
