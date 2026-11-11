"use client";
import BackButton from "@/components/back-button";
import Link from "next/link";
import { twMerge } from "tailwind-merge";
import { useCallback, useEffect, useRef, useState } from "react";
import { SpinnerIcon } from "@/components/icons";
import ScrollHeader from "@/components/scroll-header";
import { getApi } from "@/lib/client-api";

export function useRemote<T>(
  path: string | null,
  pollMs = 0,
  refreshOnReturn = false,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const loadedPath = useRef<string | null>(null);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!path) {
      loadedPath.current = null;
      setData(null);
      setError("");
      setLoading(false);
      return;
    }
    let alive = true;
    const mountedPath = window.location.pathname;
    let inFlight = false;
    let queuedRefresh = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const fetchData = () => {
      if (inFlight) {
        queuedRefresh = true;
        return;
      }
      inFlight = true;
      return getApi<T>(path)
        .then((value) => {
          if (alive) {
            loadedPath.current = path;
            setData(value);
            setError("");
          }
        })
        .catch((e: unknown) => {
          if (alive)
            setError(
              e instanceof Error ? e.message : "Unable to load. Please retry.",
            );
        })
        .finally(() => {
          inFlight = false;
          if (alive) setLoading(false);
          if (alive && queuedRefresh) {
            queuedRefresh = false;
            void fetchData();
          }
        });
    };
    // Retain the current content during refreshes of the same resource.
    // Changing resources must not display data belonging to the previous path.
    if (loadedPath.current !== path) {
      loadedPath.current = null;
      setData(null);
      setError("");
      setLoading(true);
    }
    void fetchData();
    const timer = pollMs
      ? window.setInterval(() => {
          if (
            document.visibilityState === "visible" &&
            window.location.pathname === mountedPath
          )
            void fetchData();
        }, pollMs)
      : undefined;
    const returned = () => {
      if (
        document.visibilityState !== "visible" ||
        window.location.pathname !== mountedPath
      )
        return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void fetchData(), 120);
    };
    if (refreshOnReturn) {
      window.addEventListener("focus", returned);
      window.addEventListener("popstate", returned);
      window.addEventListener("pudding-data-changed", returned);
      document.addEventListener("visibilitychange", returned);
    }
    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
      if (refreshTimer) clearTimeout(refreshTimer);
      if (refreshOnReturn) {
        window.removeEventListener("focus", returned);
        window.removeEventListener("popstate", returned);
        window.removeEventListener("pudding-data-changed", returned);
        document.removeEventListener("visibilitychange", returned);
      }
    };
  }, [path, version, pollMs, refreshOnReturn]);
  return { data, error, loading, reload };
}
export function useAction() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function run(fn: () => Promise<void>, message = "") {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { busy, error, notice, run, setError };
}
export function SessionGate({
  role,
  children,
}: {
  role?: "USER" | "CHILD";
  children: React.ReactNode;
}) {
  // Server page guards handle routing; protected APIs check current DB permissions.
  return <>{children}</>;
}
export function AppScreen({
  title,
  back = "/family",
  children,
  right,
  left,
  color = "white",
  role,
}: {
  title: string;
  back?: string | null;
  children: React.ReactNode;
  right?: React.ReactNode;
  left?: React.ReactNode;
  color?: string;
  role?: "USER" | "CHILD" | "PUBLIC";
}) {
  const content = (
    <main className="min-h-dvh pb-32" style={{ backgroundColor: color }}>
      <div className="mx-auto max-w-[520px]">
        <ScrollHeader
          title={title}
          left={
            left ?? (back !== null ? <BackButton fallback={back} /> : undefined)
          }
          right={right}
        />
        <div className="flex flex-col gap-5 px-4">{children}</div>
      </div>
    </main>
  );
  return role === "PUBLIC" ? (
    content
  ) : (
    <SessionGate role={role}>{content}</SessionGate>
  );
}
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={twMerge(
        "flex flex-col gap-4 rounded-[32px] border border-[#e8e8e8] bg-white p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}
export function Button({
  children,
  busy,
  secondary,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  secondary?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      aria-busy={busy}
      className={`flex min-h-[52px] w-full items-center justify-center rounded-full px-5 py-3 text-[17px] font-medium disabled:opacity-40 ${secondary ? "bg-[#f3f3f3] text-black" : "bg-black text-white"} ${props.className || ""}`}
    >
      {busy ? "Please wait…" : children}
    </button>
  );
}
export function ActionLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex min-h-[52px] items-center justify-between rounded-full bg-[#f3f3f3] px-5 py-3 text-[17px] font-medium"
    >
      {children}
      <span aria-hidden>›</span>
    </Link>
  );
}
export function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-2 text-[17px] font-medium">
      {label}
      <input
        {...props}
        className="h-14 w-full rounded-lg bg-[#f3f3f3] px-4 font-normal outline-none focus:ring-[3px] focus:ring-black"
      />
    </label>
  );
}
export { Select } from "@/components/select";

function LoadingIndicator() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 180);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-[40dvh] w-full items-center justify-center"
    >
      <span className="sr-only">Loading</span>
      {visible && (
        <SpinnerIcon className="size-8 text-black motion-reduce:animate-none" />
      )}
    </div>
  );
}

export function Status({
  error,
  notice,
  loading,
}: {
  error?: string;
  notice?: string;
  loading?: boolean;
}) {
  return (
    <>
      {loading && <LoadingIndicator />}
      {error && (
        <p role="alert" className="rounded-2xl bg-[#fff0ee] p-4 text-[#b42318]">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-2xl bg-[#e2f6e9] p-4">
          {notice}
        </p>
      )}
    </>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[32px] bg-[#f3f3f3] p-8 text-center text-[#5e5e5e]">
      {children}
    </div>
  );
}
