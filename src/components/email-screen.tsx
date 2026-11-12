"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/top-bar";
import { CloseCircleFilledIcon, SpinnerIcon } from "@/components/icons";
import OnboardingToast, { type OnboardingToastMessage } from "@/components/onboarding-toast";
import { useKeyboard } from "@/components/use-keyboard";
import { getApi, postApi } from "@/lib/client-api";

// Parent flow, step 3: email.
// States from Figma: empty and idle, focused and empty, typing,
// complete (Continue turns black), and loading after Continue.
export default function EmailScreen() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<OnboardingToastMessage | null>(null);
  const { open, offset } = useKeyboard(inputRef);

  const [resume, setResume] = useState<{
    email: string;
    emailVerified: boolean;
    nextRoute: string;
  } | null>(null);
  useEffect(() => {
    getApi<{ email: string; emailVerified: boolean; nextRoute: string }>(
      "/api/auth/parent/signup/status",
    )
      .then((r) => {
        setResume(r);
        setEmail(r.email);
      })
      .catch(() => undefined);
  }, []);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());
  const onKeyboard = open;

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  // Show the loading state briefly, then open the verification screen
  async function submit() {
    if (loading || !valid) return;
    if (
      resume?.emailVerified &&
      resume.email.toLowerCase() === email.trim().toLowerCase()
    ) {
      router.push(resume.nextRoute);
      return;
    }
    setLoading(true);
    setToast(null);
    try {
      const result = await postApi<{
        devOtpCode?: string;
        delivery: { delivered: boolean };
      }>(
        "/api/auth/parent/signup/start",
        { email: email.trim() },
      );
      try {
        if (result.devOtpCode) {
          sessionStorage.setItem("pudding-dev-otp", result.devOtpCode);
        } else {
          sessionStorage.removeItem("pudding-dev-otp");
        }
      } catch {}
      if (!result.delivery.delivered && !result.devOtpCode) {
        throw new Error("We couldn’t send a verification code. Please try again.");
      }
      router.push("/onboarding/verify");
    } catch (cause) {
      setToast({
        id: Date.now(),
        kind: "error",
        text: cause instanceof Error ? cause.message : "Unable to start signup.",
      });
      setLoading(false);
    }
  }

  return (
    <main
      className="min-h-dvh bg-white pb-28"
      style={onKeyboard ? { paddingBottom: offset + 56 } : undefined}
    >
      <div className="relative w-full bg-white">
        <TopBar
          backHref={resume?.email ? "/onboarding/verify" : "/onboarding/setup"}
        />

        <header className="flex flex-col gap-2 px-4 pb-8 pt-6">
          <h1 className="font-display text-[32px] font-bold leading-[40px] tracking-[-0.64px] text-black">
            Let&apos;s make money fun!
          </h1>
          <p className="text-[17px] leading-[25px] tracking-[-0.17px] text-black">
            Your kids&apos;s next adventure starts here.
          </p>
        </header>

        <OnboardingToast toast={toast} />

        <form
          id="onboarding-email-form"
          className="flex flex-col gap-2 px-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label
            htmlFor="email"
            className="text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black"
          >
            Email
          </label>
          <div
            className={`flex h-14 w-full items-center rounded-lg border-[3px] p-2 ${
              focused
                ? "border-black bg-white"
                : "border-transparent bg-[#f3f3f3]"
            }`}
          >
            <input
              ref={inputRef}
              id="email"
              type="email"
              inputMode="email"
              enterKeyHint="go"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Enter your email"
              className="h-full min-w-0 flex-1 bg-transparent px-2 text-[17px] leading-[25px] tracking-[-0.17px] text-black outline-none placeholder:text-[#5e5e5e]"
            />
            {focused && email && (
              <button
                type="button"
                aria-label="Clear email"
                // keep the keyboard open
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setEmail("")}
                className="flex h-full shrink-0 items-center justify-center px-2"
              >
                <CloseCircleFilledIcon className="size-6 text-black" />
              </button>
            )}
          </div>
        </form>
      </div>

      <div
        className={`fixed inset-x-0 z-10 ${onKeyboard ? "" : "px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4"}`}
        style={{ bottom: offset }}
      >
        <button
          type="submit"
          form="onboarding-email-form"
          onMouseDown={(e) => e.preventDefault()}
          disabled={!valid || loading}
          aria-busy={loading}
          className={`flex h-[52px] w-full items-center justify-center px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] transition-colors ${onKeyboard ? "" : "rounded-full"} ${
            valid || loading
              ? "bg-black text-white"
              : "bg-[#f3f3f3] text-[#a6a6a6]"
          }`}
        >
          {loading ? <SpinnerIcon className="size-6 text-white" /> : "Continue"}
        </button>
      </div>
    </main>
  );
}
