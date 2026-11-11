"use client";
import { useState } from "react";
import { postApi } from "@/lib/client-api";
export default function SetupExitButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="relative">
      <button
        type="button"
        disabled={busy}
        aria-label="Sign out and save setup progress"
        className="flex h-11 items-center justify-center rounded-full bg-white px-4 text-sm font-medium shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await postApi("/api/auth/logout", {});
            window.location.replace("/login");
          } catch {
            setError("Unable to sign out. Please retry.");
            setBusy(false);
          }
        }}
      >
        Save & exit
      </button>
      {error && (
        <span
          role="alert"
          className="absolute right-0 top-12 w-48 text-sm text-red-700"
        >
          {error}
        </span>
      )}
    </span>
  );
}
