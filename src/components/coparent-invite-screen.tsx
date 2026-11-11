"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AppScreen,
  Card,
  Field,
  Select,
  Button,
  Status,
  useAction,
  useRemote,
} from "@/components/app-ui";
import { Me } from "@/lib/app-types";
import { postApi } from "@/lib/client-api";
export default function CoparentInviteScreen() {
  const router = useRouter();
  const me = useRemote<Me>("/api/auth/me");
  const action = useAction();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [permissionLevel, setLevel] = useState("LIMITED");
  return (
    <AppScreen title="Invite co-parent" back="/coparent/add" role="USER">
      <p>Invite someone you trust to help manage your family.</p>
      <Status loading={me.loading} error={me.error || action.error} />
      {me.data?.user?.role !== "PRIMARY_PARENT" && !me.loading && (
        <p>Only the primary parent can invite another co-parent.</p>
      )}
      {me.data?.user?.role === "PRIMARY_PARENT" && (
        <Card>
          <Field
            label="First name"
            autoComplete="given-name"
            maxLength={49}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <Field
            label="Last name"
            autoComplete="family-name"
            maxLength={50}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <Field
            label="Their email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Select
            label="Family access"
            value={permissionLevel}
            onChange={(value) => setLevel(value)}
          >
            <option value="LIMITED">
              Limited — chores, allowance & purchase approvals
            </option>
            <option value="EQUAL">Full — family management</option>
          </Select>
          <p className="text-sm text-[#5e5e5e]">
            Limited access allows chores, allowance schedules and purchase
            approvals. Full access also allows family limits, child management
            and spending rules. Inviting, changing or removing co-parents
            remains primary-parent only.
          </p>
          <Button
            busy={action.busy}
            disabled={
              !firstName.trim() ||
              !lastName.trim() ||
              !/^\S+@\S+\.\S+$/.test(email.trim())
            }
            onClick={() =>
              void action.run(async () => {
                const r = await postApi<{
                  invite: { inviteAcceptUrl: string; email: string };
                  delivery?: { delivered: boolean };
                }>("/api/family/co-parents", {
                  firstName,
                  lastName,
                  email,
                  permissionLevel,
                });
                sessionStorage.setItem(
                  "pudding-last-invite",
                  JSON.stringify({
                    email: r.invite.email,
                    url: `${window.location.origin}${new URL(r.invite.inviteAcceptUrl).pathname}${new URL(r.invite.inviteAcceptUrl).search}`,
                    delivered: r.delivery?.delivered || false,
                  }),
                );
                router.replace("/coparent/sent");
              })
            }
          >
            Create invitation
          </Button>
        </Card>
      )}
    </AppScreen>
  );
}
