"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/top-bar";
import {
  EyeClosedIcon,
  EyeIcon,
  SpinnerIcon,
  TickCircleIcon,
} from "@/components/icons";
import { useKeyboard } from "@/components/use-keyboard";
import { postApi } from "@/lib/client-api";

// Parent flow, step 5: set a password.
// States from Figma: empty (idle and focused), typing with the password
// hidden, typing with it shown, filled (8+ characters, Continue turns black)
// and loading after Continue. Sample data only: nothing is saved.
const MIN_LENGTH = 8;

export default function PasswordScreen() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { open, offset } = useKeyboard(inputRef);

  const valid = password.length >= MIN_LENGTH;
  const onKeyboard = focused && open;

  async function submit() {
    if (loading || !valid) return;
    setLoading(true);
    setError("");
    try {
      await postApi("/api/auth/parent/signup/password", { password });
      router.push("/notifications");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save password.");
      setLoading(false);
    }
  }

  const barText =
    "text-[17px] font-medium leading-[22px] tracking-[-0.17px] transition-colors";
  const barColor =
    valid || loading ? "bg-black text-white" : "bg-[#f3f3f3] text-[#a6a6a6]";
  const barInner = loading ? <SpinnerIcon className="size-6 text-white" /> : "Continue";

  return (
    <main className="min-h-dvh bg-white">
      <div className="w-full bg-white">
        <TopBar backHref="/verify" glassHelp />

        <header className="flex flex-col gap-2 px-4 pb-8 pt-6">
          <h1 className="font-display text-[32px] font-bold leading-[40px] tracking-[-0.64px] text-black">
            Create password
          </h1>
          <p className="text-[17px] leading-[25px] tracking-[-0.17px] text-black">
            Set a password to keep your account secure.
          </p>
        </header>

        {error && <p role="alert" className="px-4 pb-3 text-sm text-red-700">{error}</p>}

        <form
          className="flex flex-col gap-2 px-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label
            htmlFor="password"
            className="text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black"
          >
            Password
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
              id="password"
              type={shown ? "text" : "password"}
              autoComplete="new-password"
              autoCapitalize="none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Enter your password"
              className="h-full min-w-0 flex-1 bg-transparent px-2 text-[17px] leading-[25px] tracking-[-0.17px] text-black outline-none placeholder:text-[#5e5e5e]"
            />
            {password && (
              <button
                type="button"
                aria-label={shown ? "Hide password" : "Show password"}
                // keep the keyboard open
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShown((v) => !v)}
                className="flex h-full shrink-0 items-center justify-center px-2"
              >
                {shown ? (
                  <EyeIcon className="size-6 text-black" />
                ) : (
                  <EyeClosedIcon className="size-6 text-black" />
                )}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            {valid && (
              <span className="flex items-start py-[3px]">
                <TickCircleIcon className="size-4" />
              </span>
            )}
            <p
              className={`text-[13px] leading-[18px] tracking-[-0.13px] ${
                valid ? "text-[#0e8345]" : "text-[#5e5e5e]"
              }`}
            >
              Password must be least 8 words
            </p>
          </div>
        </form>
      </div>

      {onKeyboard ? (
        /* Flat Continue bar sitting on top of the keyboard */
        <div className="fixed inset-x-0 z-10" style={{ bottom: offset }}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
            disabled={!valid && !loading}
            aria-busy={loading}
            className={`flex h-[52px] w-full items-center justify-center px-5 py-3.5 ${barText} ${barColor}`}
          >
            {barInner}
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
            className={`flex h-[52px] w-full items-center justify-center rounded-full px-5 py-3.5 ${barText} ${barColor}`}
          >
            {barInner}
          </button>
        </div>
      )}
    </main>
  );
}
