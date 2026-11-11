"use client";
import { ListEnd, usePagedList } from "@/components/paged-list";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AppScreen,
  Card,
  Field,
  Button,
  Status,
  ActionLink,
  Empty,
  useRemote,
  useAction,
} from "@/components/app-ui";
import { getApi, postApi, putApi } from "@/lib/client-api";
import { enableWebPush, disableWebPush } from "@/lib/web-push-client";
import { Me } from "@/lib/app-types";
import { topupPath } from "@/lib/topup-navigation";
export function SecuritySettings({
  continueToTopup = false,
}: {
  continueToTopup?: boolean;
}) {
  const router = useRouter();
  const action = useAction();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const remote = useRemote<{ pinSet: boolean; canTopUp: boolean }>(
    "/api/auth/parent/pin",
  );
  const resumeTopup = continueToTopup && remote.data?.canTopUp === true;
  return (
    <AppScreen
      title="Security & PIN"
      back={resumeTopup ? "/family" : "/account"}
      role="USER"
    >
      <Status
        loading={remote.loading}
        error={remote.error || action.error}
        notice={action.notice}
      />
      <Card>
        <h2 className="font-display text-xl font-bold">
          {remote.data?.pinSet
            ? "Reset your parent PIN"
            : "Create your parent PIN"}
        </h2>
        <p className="text-sm text-[#5e5e5e]">
          {resumeTopup
            ? "Save your PIN to continue to Top up."
            : "Your parent PIN confirms top-ups and child activation. Your child has their own separate login PIN."}
        </p>
        {remote.data?.pinSet && (
          <Field
            label="Your account password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        <Field
          label="New six-digit parent PIN"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        />
        <Field
          label="Confirm PIN"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
        />
        <Button
          busy={action.busy}
          disabled={
            !remote.data ||
            pin.length !== 6 ||
            pin !== confirm ||
            Boolean(remote.data?.pinSet && !password)
          }
          onClick={() =>
            void action.run(async () => {
              await postApi("/api/auth/parent/pin", { newPin: pin, password });
              if (resumeTopup) {
                router.replace(topupPath);
                return;
              }
              setPin("");
              setConfirm("");
              setPassword("");
              remote.reload();
            }, "Parent PIN saved.")
          }
        >
          Save parent PIN
        </Button>
      </Card>
      <ActionLink href="/forgot-password">
        Reset your account password
      </ActionLink>
      <ActionLink href="/children">Manage child profiles</ActionLink>
    </AppScreen>
  );
}
type Preferences = {
  pushEnabled: boolean;
  emailEnabled: boolean;
  notifyEveryTransaction: boolean;
  weeklyDigestEnabled: boolean;
};
export function PreferencesScreen() {
  const remote = useRemote<{ preferences: Preferences }>(
    "/api/notifications/preferences",
  );
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const action = useAction();
  useEffect(() => {
    if (remote.data) setPrefs(remote.data.preferences);
  }, [remote.data]);
  return (
    <AppScreen title="Notifications" back="/account" role="USER">
      <Status
        loading={remote.loading}
        error={remote.error || action.error}
        notice={action.notice}
      />
      {prefs && (
        <Card>
          {(
            [
              { key: "pushEnabled", label: "Browser push notifications" },
              { key: "emailEnabled", label: "Email updates" },
              {
                key: "notifyEveryTransaction",
                label: "Notify for every transaction",
              },
              { key: "weeklyDigestEnabled", label: "Weekly digest" },
            ] as const
          ).map((row) => (
            <label
              key={row.key}
              className="flex items-center justify-between gap-3 py-2"
            >
              {row.label}
              <input
                type="checkbox"
                checked={prefs[row.key]}
                onChange={(e) =>
                  setPrefs({ ...prefs, [row.key]: e.target.checked })
                }
              />
            </label>
          ))}
          <Button
            busy={action.busy}
            onClick={() =>
              void action.run(async () => {
                await putApi("/api/notifications/preferences", prefs);
                if (!prefs.pushEnabled) await disableWebPush();
                remote.reload();
              }, "Preferences saved.")
            }
          >
            Save preferences
          </Button>
          <Button
            secondary
            busy={action.busy}
            onClick={() =>
              void action.run(async () => {
                await enableWebPush();
                await putApi("/api/notifications/preferences", {
                  pushEnabled: true,
                });
                remote.reload();
              }, "Browser push connected.")
            }
          >
            Connect this browser
          </Button>
          <p className="text-sm text-[#5e5e5e]">
            Email delivery is disabled in local development. Your in-app inbox
            works without push permission.
          </p>
        </Card>
      )}
    </AppScreen>
  );
}
export function ForgotPasswordScreen() {
  const router = useRouter();
  const action = useAction();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [dev, setDev] = useState("");
  return (
    <AppScreen title="Reset your password" back="/login" role="PUBLIC">
      <Status error={action.error} notice={action.notice} />
      <Card>
        <p>We’ll send a code to your parent account’s email.</p>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setSent(false);
            setDev("");
          }}
        />
        <Button
          secondary
          busy={action.busy}
          disabled={!/^\S+@\S+\.\S+$/.test(email)}
          onClick={() =>
            void action.run(async () => {
              const r = await postApi<{ devOtpCode?: string }>(
                "/api/auth/verify/send-code",
                { target: email, channel: "EMAIL", purpose: "PASSWORD_RESET" },
              );
              setSent(true);
              setDev(r.devOtpCode || "");
            }, "Verification code requested.")
          }
        >
          {sent ? "Resend code" : "Send code"}
        </Button>
        {sent && (
          <>
            {dev && (
              <p className="rounded-xl bg-[#fff9db] p-3 text-sm">
                Development code: {dev}
              </p>
            )}
            <Field
              label="Verification code"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <Field
              label="New password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              busy={action.busy}
              disabled={code.length !== 6 || password.length < 8}
              onClick={() =>
                void action.run(async () => {
                  await postApi("/api/auth/password/reset", {
                    email,
                    newPassword: password,
                    otpCode: code,
                  });
                  router.replace("/login");
                })
              }
            >
              Reset & sign in
            </Button>
          </>
        )}
      </Card>
    </AppScreen>
  );
}
export function SupportScreen() {
  const remote = usePagedList<{
    id: string;
    subject: string;
    message: string;
    status: string;
    adminResponse: string | null;
  }>("/api/support");
  const action = useAction();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  return (
    <AppScreen title="Contact support" back="/account" role="USER">
      <Status
        loading={remote.loading}
        error={remote.error || action.error}
        notice={action.notice}
      />
      <Card>
        <Field
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <label className="flex flex-col gap-2">
          Tell us what happened
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-32 rounded-lg bg-[#f3f3f3] p-4"
            maxLength={3000}
          />
        </label>
        <Button
          busy={action.busy}
          disabled={subject.trim().length < 3 || message.trim().length < 10}
          onClick={() =>
            void action.run(async () => {
              await postApi("/api/support", { subject, message });
              setSubject("");
              setMessage("");
              remote.reload();
            }, "Support request saved.")
          }
        >
          Save support request
        </Button>
        <p className="text-sm text-[#5e5e5e]">
          Demo requests are stored in Pudding. No external support team is
          contacted.
        </p>
      </Card>
      {!remote.loading && !remote.error && remote.items.length === 0 && (
        <Empty>No support requests yet.</Empty>
      )}
      {remote.items.map((t) => (
        <Card key={t.id}>
          <h2 className="font-display text-xl font-bold">{t.subject}</h2>
          <p>{t.message}</p>
          <p className="text-sm">{t.status}</p>
          {t.adminResponse && <p>{t.adminResponse}</p>}
        </Card>
      ))}
      <ListEnd list={remote} />
    </AppScreen>
  );
}
export function AboutScreen() {
  return (
    <AppScreen title="About Pudding" back="/account">
      <Card>
        <img src="/kid-home/coin-stack.svg" alt="" className="size-20" />
        <h2 className="font-display text-3xl font-bold">
          Little habits. Big futures.
        </h2>
        <p>
          Pudding helps families practice spending, saving and earning with
          parent supervision.
        </p>
        <p>
          This is our PayPal AI hackathon demo. Top-ups increase an internal
          shared family limit. Only approved purchases create PayPal Sandbox
          payments.
        </p>
        <p className="text-sm text-[#5e5e5e]">Created by Manjesh and Nadeem.</p>
      </Card>
      <ActionLink href="/help">Help & support</ActionLink>
    </AppScreen>
  );
}
