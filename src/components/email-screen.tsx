"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/top-bar";
import { CloseCircleFilledIcon, SpinnerIcon } from "@/components/icons";
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
  const [error, setError] = useState("");
  // Is the phone keyboard open, and how far up the bottom bar must sit.
  // The offset is 0 when the browser already shrinks the page above the keyboard.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [offset, setOffset] = useState(0);

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
  const onKeyboard = focused && keyboardOpen;

  // Find out whether the phone keyboard is open. Browsers differ: some shrink
  // the page, some only shrink the visible area, some overlay the keyboard.
  useEffect(() => {
    type VirtualKeyboard = EventTarget & {
      overlaysContent: boolean;
      boundingRect: { height: number };
    };
    const vk = (navigator as Navigator & { virtualKeyboard?: VirtualKeyboard })
      .virtualKeyboard;

    if (vk) {
      const previous = vk.overlaysContent;
      vk.overlaysContent = true;
      const update = () => {
        const h = Math.round(vk.boundingRect.height);
        setKeyboardOpen(h > 0);
        setOffset(h);
      };
      vk.addEventListener("geometrychange", update);
      update();
      return () => {
        vk.removeEventListener("geometrychange", update);
        vk.overlaysContent = previous;
      };
    }

    const vv = window.visualViewport;
    if (!vv) return;
    // Page height while the keyboard is closed
    let base = window.innerHeight;
    function update() {
      if (!vv) return;
      const typing = document.activeElement === inputRef.current;
      if (!typing) base = window.innerHeight;
      // Page shrank, or visible area shrank
      setKeyboardOpen(typing && base - vv.height > 100);
      // Part of the keyboard the page did not already make room for
      setOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    }
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

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
    setError("");
    try {
      const result = await postApi<{ email: string; devOtpCode?: string }>(
        "/api/auth/parent/signup/start",
        { email: email.trim() },
      );
      try {
        sessionStorage.setItem("pudding-email", result.email);
        if (result.devOtpCode) {
          sessionStorage.setItem("pudding-dev-otp", result.devOtpCode);
        } else {
          sessionStorage.removeItem("pudding-dev-otp");
        }
      } catch {}
      router.push("/onboarding/verify");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to start signup.",
      );
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-white">
      <div className="w-full bg-white">
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

        {error && (
          <p role="alert" className="px-4 pb-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <form
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

      {onKeyboard ? (
        /* Flat Continue bar sitting on top of the keyboard */
        <div className="fixed inset-x-0 z-10" style={{ bottom: offset }}>
          <button
            type="button"
            // keep the keyboard open when the bar is tapped
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
            disabled={!valid && !loading}
            aria-busy={loading}
            className={`flex h-[52px] w-full items-center justify-center px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] transition-colors ${
              valid || loading
                ? "bg-black text-white"
                : "bg-[#f3f3f3] text-[#a6a6a6]"
            }`}
          >
            {loading ? (
              <SpinnerIcon className="size-6 text-white" />
            ) : (
              "Continue"
            )}
          </button>
        </div>
      ) : (
        /* Continue pill at the bottom of the screen */
        <div className="fixed inset-x-0 bottom-0 z-10 px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
          <button
            type="button"
            onClick={submit}
            disabled={!valid && !loading}
            aria-busy={loading}
            className={`flex h-[52px] w-full items-center justify-center rounded-full px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] transition-colors ${
              valid || loading
                ? "bg-black text-white"
                : "bg-[#f3f3f3] text-[#a6a6a6]"
            }`}
          >
            {loading ? (
              <SpinnerIcon className="size-6 text-white" />
            ) : (
              "Continue"
            )}
          </button>
        </div>
      )}
    </main>
  );
}
