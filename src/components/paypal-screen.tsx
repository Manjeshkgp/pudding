"use client";

import Link from "next/link";
import BackButton from "@/components/back-button";
import SetupExitButton from "@/components/setup-exit-button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { AVATARS } from "@/components/avatar-sheet";
import PaypalMark from "@/components/paypal-mark";
import { getApi, postApi } from "@/lib/client-api";
import PayPalSuccessScreen from "@/components/connecting-screen";

// Link PayPal identity, then save the Sandbox wallet for approved demo purchases.
function UserFilled() {
  return (
    <svg viewBox="0 0 28 28" className="size-7" aria-hidden="true">
      <circle cx="14" cy="8.5" r="5.5" fill="currentColor" />
      <path
        d="M3.5 25c0-5.5 4.7-9 10.5-9s10.5 3.5 10.5 9z"
        fill="currentColor"
      />
    </svg>
  );
}
function EyeScan() {
  return (
    <svg viewBox="0 0 28 28" className="size-7" aria-hidden="true">
      <path
        d="M3 9V5.5A2.5 2.5 0 0 1 5.5 3H9M19 3h3.5A2.5 2.5 0 0 1 25 5.5V9M25 19v3.5a2.5 2.5 0 0 1-2.5 2.5H19M9 25H5.5A2.5 2.5 0 0 1 3 22.5V19"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M4.5 14C7 9.8 10.3 8 14 8s7 1.8 9.5 6c-2.5 4.2-5.8 6-9.5 6s-7-1.8-9.5-6z"
        fill="currentColor"
      />
      <circle cx="14" cy="14" r="2.8" fill="#eff4fe" />
    </svg>
  );
}
function DollarCircle() {
  return (
    <svg viewBox="0 0 28 28" className="size-7" aria-hidden="true">
      <circle cx="14" cy="14" r="11.5" fill="currentColor" />
      <path
        d="M17.5 10.3c-.4-1.3-1.8-2.1-3.5-2.1-2 0-3.4 1-3.4 2.5 0 3.6 7 1.8 7 5.5 0 1.6-1.5 2.7-3.6 2.7-1.8 0-3.3-.9-3.7-2.3M14 6.5v15"
        fill="none"
        stroke="#eff4fe"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

const STEPS = [
  { Icon: UserFilled, text: "Sign in to your PayPal account." },
  { Icon: EyeScan, text: "Review the payment permissions." },
  { Icon: DollarCircle, text: "Allow payments through your PayPal account." },
];
type WalletSetupResult =
  | { vaultConnected: true }
  | { vaultConnected: false; approvalUrl: string };

export default function PaypalScreen({
  mode = "management",
}: {
  mode?: "management" | "onboarding";
}) {
  const router = useRouter();
  const [me, setMe] = useState(0);
  const [paypalVerified, setPaypalVerified] = useState(false);
  const [vaultConnected, setVaultConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const i = Number(sessionStorage.getItem("pudding-avatar"));
      if (Number.isInteger(i) && AVATARS[i]) setMe(i);
    } catch {}

    const params = new URLSearchParams(window.location.search);
    const vaultResult = params.get("paypal_vault");
    const oauthResult = params.get("paypal_oauth");
    let active = true;
    getApi<{
      subjectType: string;
      user?: { paypalIsVerified: boolean; paypalVaultConnected: boolean };
    }>("/api/auth/me")
      .then(({ subjectType, user }) => {
        if (!active || subjectType !== "USER" || !user) return;
        setPaypalVerified(user.paypalIsVerified);
        setVaultConnected(user.paypalVaultConnected);
        if (user.paypalVaultConnected) return;
        if (vaultResult === "error" || vaultResult === "connected") {
          setError("PayPal wallet setup could not be confirmed. Please try again.");
        } else if (vaultResult === "cancelled") {
          setMessage("PayPal wallet setup was cancelled. You can try again when ready.");
        } else if (oauthResult === "cancelled") {
          setMessage("PayPal sign-in was cancelled. You can try again when ready.");
        } else if (oauthResult === "error") {
          setError("We couldn’t link your PayPal account. Please try signing in again.");
        } else if (oauthResult === "connected" && !user.paypalIsVerified) {
          setError("PayPal hasn’t verified this account. Try again with a verified Sandbox account.");
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Sign in to your Pudding parent account before connecting PayPal.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function connectPayPal() {
    if (loading || connecting) return;
    setError("");
    setMessage("");
    if (vaultConnected) {
      if (mode === "onboarding") {
        setConnecting(true);
        window.location.replace("/api/auth/navigation/refresh?returnTo=%2Fonboarding");
      } else router.replace("/account");
      return;
    }
    setConnecting(true);
    try {
      if (!paypalVerified) {
        const returnTo = mode === "onboarding" ? "paypal" : "settings";
        const { authorizationUrl } = await getApi<{ authorizationUrl: string }>(
          `/api/auth/paypal/connect?mode=json&returnTo=${returnTo}`,
        );
        window.location.assign(authorizationUrl);
        return;
      }
      const result = await postApi<WalletSetupResult>(
        "/api/auth/paypal/vault/setup",
        {},
      );
      if (result.vaultConnected) {
        setVaultConnected(true);
        setConnecting(false);
      } else window.location.assign(result.approvalUrl);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to start PayPal wallet setup.",
      );
      setConnecting(false);
    }
  }

  if (!loading && vaultConnected) {
    return (
      <PayPalSuccessScreen
        key="wallet-saved"
        title="PayPal wallet saved"
        description={mode === "onboarding"
          ? "Your wallet is ready for approved Sandbox purchases. Set your parent PIN next."
          : "Your wallet is ready for approved Sandbox purchases."}
        animation="paypal-connection"
        label="Continue"
        busy={connecting}
        onContinue={connectPayPal}
      />
    );
  }
  if (!loading && paypalVerified && !error && !message) {
    return (
      <PayPalSuccessScreen
        key="paypal-linked"
        title="PayPal account linked"
        description="Approve saving your wallet so it can fund approved Sandbox purchases."
        label="Continue to save wallet"
        busy={connecting}
        onContinue={connectPayPal}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-white">
      <div className="px-4 pt-[max(20px,env(safe-area-inset-top))]">
        <div className="flex h-11 items-center justify-between">
          {mode === "onboarding" ? (
            <span className="size-11" />
          ) : (
            <BackButton
              fallback="/account"
              aria-label="Back"
              className="flex size-11 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
            >
              <ChevronLeftIcon className="size-6 text-black" />
            </BackButton>
          )}
          {mode === "onboarding" ? (
            <SetupExitButton />
          ) : (
            <Link
              href="/account"
              aria-label="Account"
              className="size-11 overflow-hidden rounded-full"
              style={{ backgroundColor: AVATARS[me].bg }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={AVATARS[me].src} alt="" className="size-full" />
            </Link>
          )}
        </div>

        <div className="flex flex-col gap-2 pb-8 pt-6">
          <div className="relative h-[76px] w-full">
            <span className="absolute left-0 top-0 size-16 overflow-hidden rounded-full bg-[#ffd7ef]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/profile/avatar-2.svg"
                alt=""
                className="size-full"
              />
            </span>
            <PaypalMark className="absolute left-[43.43px] top-0 size-16" />
          </div>
          <h1 className="font-display text-[32px] font-bold leading-[40px] tracking-[-0.64px] text-black">
            Connect your PayPal
          </h1>
          <p className="text-[17px] leading-[25px] tracking-[-0.17px] text-black">
            Your saved PayPal Sandbox wallet will fund approved demo purchases.
            Top-ups only increase your internal family limit.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-7 pb-[200px]">
        <h2 className="px-4 text-xl font-semibold leading-7 tracking-[-0.15px] text-black">
          Set up your PayPal connection in 3 easy steps
        </h2>
        <ul className="flex flex-col gap-5">
          {STEPS.map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-4 px-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#eff4fe] text-black">
                <Icon />
              </span>
              <span className="min-w-0 flex-1 text-[17px] leading-[25px] tracking-[-0.17px] text-black">
                {text}
              </span>
            </li>
          ))}
        </ul>
        {message && (
          <p
            role="status"
            className="mx-4 rounded-lg bg-[#eff4fe] px-3 py-2 text-sm text-black"
          >
            {message}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mx-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
        <div className="rounded-3xl bg-[#f3f3f3]">
          <button
            type="button"
            onClick={connectPayPal}
            disabled={loading || connecting}
            aria-busy={loading || connecting}
            className="flex h-[52px] w-full items-center justify-center rounded-full bg-black px-5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-white disabled:opacity-60"
          >
            {loading
              ? "Checking PayPal…"
              : connecting
                ? "Opening PayPal…"
                : paypalVerified
                  ? "Try saving wallet again"
                  : error || message
                    ? "Try PayPal sign-in again"
                    : "Connect PayPal"}
          </button>
        </div>
      </div>
    </main>
  );
}
