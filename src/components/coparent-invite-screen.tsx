"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BackPill, PrimaryButton, saveInvite } from "@/components/coparent-parts";
import { useKeyboard } from "@/components/use-keyboard";

// Parent flow: type the co-parent's email and "send" the invite link (sample only, nothing is sent).
export default function CoparentInviteScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { open, offset } = useKeyboard(inputRef);
  const onKeyboard = focused && open;
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  function send() {
    if (!valid) return;
    saveInvite(email.trim());
    router.push("/coparent/sent");
  }

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto w-full max-w-[520px] pt-[max(16px,env(safe-area-inset-top))]">
        <div className="px-4">
          <BackPill />
        </div>
        <div className="flex flex-col gap-2 px-4 pb-8 pt-6 text-black">
          <h1 className="font-display text-[32px] font-bold leading-10 tracking-[-0.64px]">Invite co-parent</h1>
          <p className="text-[17px] leading-[25px] tracking-[-0.17px]">
            We’ll send the invite link to the given email.
          </p>
        </div>
        <form
          className="flex flex-col gap-2 px-4"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor="coparent-email" className="text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black">
            Email
          </label>
          <div
            className={`flex h-14 items-center overflow-clip rounded-lg p-2 ${
              focused ? "border-[3px] border-black bg-white" : "bg-[#f3f3f3]"
            }`}
          >
            <input
              id="coparent-email"
              ref={inputRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className="min-w-0 flex-1 bg-transparent px-2 text-[17px] leading-[25px] tracking-[-0.17px] text-black outline-none placeholder:text-[#5e5e5e]"
            />
          </div>
        </form>
      </div>
      {onKeyboard ? (
        /* Flat bar sitting on top of the keyboard, same as the email screen */
        <div className="fixed inset-x-0 z-10" style={{ bottom: offset }}>
          <button
            type="button"
            // keep the keyboard open when the bar is tapped
            onMouseDown={(e) => e.preventDefault()}
            onClick={send}
            disabled={!valid}
            className={`flex h-[52px] w-full items-center justify-center px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] transition-colors ${
              valid ? "bg-black text-white" : "bg-[#f3f3f3] text-[#a6a6a6]"
            }`}
          >
            Send invite link
          </button>
        </div>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[520px] bg-white px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
          <PrimaryButton disabled={!valid} onClick={send}>
            Send invite link
          </PrimaryButton>
        </div>
      )}
    </main>
  );
}
