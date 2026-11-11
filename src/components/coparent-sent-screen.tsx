"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AppScreen,
  Card,
  Button,
  Status,
  useAction,
} from "@/components/app-ui";
export default function CoparentSentScreen() {
  const router = useRouter();
  const [invite, setInvite] = useState<{
    email: string;
    url: string;
    delivered: boolean;
  } | null>(null);
  const action = useAction();
  useEffect(() => {
    try {
      setInvite(
        JSON.parse(sessionStorage.getItem("pudding-last-invite") || "null"),
      );
    } catch {}
  }, []);
  return (
    <AppScreen title="Invitation ready" back="/coparent" role="USER">
      <Card>
        <img src="/images/playful/view-mail.svg" alt="" className="size-20" />
        {invite ? (
          <>
            <h2 className="font-display text-2xl font-bold">
              Invite created for {invite.email}
            </h2>
            <p>
              {invite.delivered
                ? "The invitation email was sent."
                : "Email delivery is disabled or unavailable. Copy and share this invitation link."}
            </p>
            <p className="text-sm text-[#5e5e5e]">
              This link expires 24 hours after it was issued.
            </p>
            <Button
              onClick={() =>
                void action.run(async () => {
                  await navigator.clipboard.writeText(invite.url);
                }, "Link copied.")
              }
            >
              Copy invitation link
            </Button>
            <input
              className="w-full rounded-lg bg-[#f3f3f3] p-3 text-xs"
              readOnly
              value={invite.url}
              aria-label="Invitation link"
            />
          </>
        ) : (
          <p>Open your co-parent list to create or copy an invitation.</p>
        )}
      </Card>
      <Status error={action.error} notice={action.notice} />
      <Button onClick={() => router.replace("/coparent")}>Done</Button>
    </AppScreen>
  );
}
