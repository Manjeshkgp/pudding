"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/top-bar";

export default function EmailScreen() {
  const [email, setEmail] = useState("");
  // How far the phone keyboard covers the bottom of the page
  const [keyboard, setKeyboard] = useState(0);

  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  // Keep the Continue bar sitting right on top of the keyboard
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      if (!vv) return;
      setKeyboard(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    }
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <main className="min-h-dvh bg-white">
      <div className="w-full bg-white">
        <TopBar backHref="/setup" help={false} />

        <header className="flex flex-col gap-2 px-4 pb-8 pt-6">
          <h1 className="font-display text-[32px] font-bold leading-[40px] tracking-[-0.64px] text-black">
            Welcome, new parent
          </h1>
          <p className="text-[17px] leading-[25px] tracking-[-0.17px] text-black">
            Enter your email to get started
          </p>
        </header>

        <form
          className="px-4"
          onSubmit={(e) => e.preventDefault()}
        >
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            aria-label="Email"
            className="h-14 w-full rounded-lg border-[3px] border-black bg-white px-4 text-[17px] leading-[25px] tracking-[-0.17px] text-black outline-none placeholder:text-[#5e5e5e]"
          />
        </form>
      </div>

      {/* Continue bar, sits above the keyboard */}
      <div
        className="fixed inset-x-0 z-10"
        style={{ bottom: keyboard }}
      >
        <button
          type="button"
          disabled={!valid}
          className={`flex min-h-[52px] w-full items-center justify-center px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] transition-colors ${
            valid ? "bg-black text-white" : "bg-[#f3f3f3] text-[#a6a6a6]"
          } ${keyboard === 0 ? "pb-[max(14px,env(safe-area-inset-bottom))]" : ""}`}
        >
          Continue
        </button>
      </div>
    </main>
  );
}
