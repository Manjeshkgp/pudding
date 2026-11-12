"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const shownKey = "pudding-install-prompt-shown";

export default function InstallAppPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(
    null,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const installEvent = event as InstallPromptEvent;
      setInstallEvent(installEvent);
      if (
        !window.matchMedia("(display-mode: standalone)").matches &&
        !localStorage.getItem(shownKey)
      ) {
        setVisible(true);
      }
    };
    const onInstalled = () => {
      localStorage.setItem(shownKey, "true");
      setVisible(false);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible || !installEvent) return null;

  const dismiss = () => {
    localStorage.setItem(shownKey, "true");
    setVisible(false);
    setInstallEvent(null);
  };
  const install = async () => {
    const promptEvent = installEvent;
    localStorage.setItem(shownKey, "true");
    setVisible(false);
    setInstallEvent(null);
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch {
      // The explicit Install choice suppresses future banners even if Chrome
      // cannot open its native confirmation for this one-time event.
    }
  };

  return (
    <aside
      role="dialog"
      aria-label="Install Pudding"
      className="fixed inset-x-4 bottom-5 z-[100] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-black/10 bg-white p-4 shadow-xl"
    >
      {/* Reuse the same brand image as the favicon, app icon, and push icon. */}
      <img
        src="/images/pudding-app-icon.svg"
        alt=""
        className="h-12 w-12 shrink-0 rounded-xl"
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Get Pudding on your device</p>
        <p className="text-sm text-slate-600">Install the app for quick access.</p>
      </div>
      <button
        type="button"
        className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white"
        onClick={() => void install()}
      >
        Install
      </button>
      <button
        type="button"
        aria-label="Dismiss install prompt"
        className="px-1 text-xl text-slate-500"
        onClick={dismiss}
      >
        ×
      </button>
    </aside>
  );
}
