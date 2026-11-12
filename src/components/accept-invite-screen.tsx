"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AppScreen,
  Card,
  Field,
  Button,
  Status,
  useAction,
  useRemote,
} from "@/components/app-ui";
import { postApi } from "@/lib/client-api";
export default function AcceptInviteScreen() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const action = useAction();
  useEffect(
    () =>
      setToken(new URLSearchParams(window.location.search).get("token") || ""),
    [],
  );
  const remote = useRemote<{
    name: string;
    firstName: string | null;
    lastName: string | null;
    familyName: string;
    permissionLevel: string;
  }>(
    token
      ? `/api/family/co-parents/accept?token=${encodeURIComponent(token)}`
      : null,
  );
  useEffect(() => {
    if (remote.data) {
      setName(remote.data.name);
      setFirstName(remote.data.firstName ?? "");
      setLastName(remote.data.lastName ?? "");
    }
  }, [remote.data]);
  const hasNameParts = Boolean(remote.data?.firstName && remote.data?.lastName);
  return (
    <AppScreen title="Join your family" back="/parent" role="PUBLIC">
      <Status loading={remote.loading} error={remote.error || action.error} />
      {token === "" && (
        <p role="alert">Open the invitation link shared by your family.</p>
      )}
      {remote.data && (
        <Card>
          <h2 className="font-display text-2xl font-bold">
            {remote.data.familyName}
          </h2>
          <p>
            You’re invited as a co-parent with{" "}
            {remote.data.permissionLevel === "EQUAL" ? "full" : "limited"}{" "}
            access.
          </p>
          {hasNameParts ? (
            <>
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
            </>
          ) : (
            <Field
              label="Your name"
              autoComplete="name"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <Field
            label="Create password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button
            busy={action.busy}
            disabled={
              (hasNameParts
                ? !firstName.trim() || !lastName.trim()
                : name.trim().length < 2) ||
              password.length < 8 ||
              password !== confirm
            }
            onClick={() =>
              void action.run(async () => {
                await postApi("/api/family/co-parents/accept", {
                  inviteToken: token,
                  ...(hasNameParts ? { firstName, lastName } : { name }),
                  password,
                });
                router.replace("/family");
                router.refresh();
              })
            }
          >
            Accept & join family
          </Button>
        </Card>
      )}
    </AppScreen>
  );
}
