let sessionRecoveryStarted = false;

export class ClientApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

export async function postApi<T>(path: string, body: unknown): Promise<T> {
  return requestApi<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Share concurrent reads only (e.g. the same /auth/me requested by two cards).
// There is no stored response cache, so later visits still validate current data.
const pendingReads = new Map<string, Promise<unknown>>();
export function getApi<T>(path: string): Promise<T> {
  const existing = pendingReads.get(path);
  if (existing) return existing as Promise<T>;
  const pending = requestApi<T>(path, {
    method: "GET",
    cache: "no-store",
  }).finally(() => {
    if (pendingReads.get(path) === pending) pendingReads.delete(path);
  });
  pendingReads.set(path, pending);
  return pending;
}

export async function patchApi<T>(path: string, body: unknown): Promise<T> {
  return requestApi<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function requestApi<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin" });
  const result = (await response.json().catch(() => null)) as {
    success?: boolean;
    data?: T;
    error?: {
      message?: string;
      code?: string;
      details?: unknown;
    };
  } | null;

  if (!response.ok || !result?.success || result.data === undefined) {
    const expectedGuestProfile =
      typeof window !== "undefined" &&
      window.location.pathname === "/onboarding/profile" &&
      path === "/api/auth/me";
    if (
      typeof window !== "undefined" &&
      !expectedGuestProfile &&
      !sessionRecoveryStarted &&
      [
        "UNAUTHORIZED",
        "ACCOUNT_FROZEN",
        "FAMILY_FROZEN",
        "CHILD_FROZEN",
        "SIGNUP_SESSION_EXPIRED",
        "SIGNUP_SESSION_REQUIRED",
        "SIGNUP_SESSION_INVALID",
      ].includes(result?.error?.code || "")
    ) {
      sessionRecoveryStarted = true;
      window.location.replace(
        "/api/auth/navigation/refresh?returnTo=" +
          encodeURIComponent(window.location.pathname),
      );
    }

    throw new ClientApiError(
      (typeof result?.error?.details === "object" &&
      result.error.details !== null
        ? Object.values(result.error.details)
            .filter(Array.isArray)
            .flat()
            .filter((v: unknown) => typeof v === "string")
            .join(" ")
        : "") ||
        result?.error?.message ||
        "Something went wrong. Please try again.",
      response.status,
      result?.error?.code,
    );
  }

  if (
    typeof window !== "undefined" &&
    [
      "/api/auth/parent/signup/complete",
      "/api/auth/parent/login",
      "/api/auth/child/login",
      "/api/auth/logout",
      "/api/auth/parent/pin",
      "/api/onboarding/children/complete",
    ].includes(path)
  ) {
    try {
      localStorage.setItem("pudding-auth-changed", String(Date.now()));
    } catch {}
    window.dispatchEvent(new Event("pudding-auth-changed"));
  }
  if (
    typeof window !== "undefined" &&
    init.method &&
    !["GET", "HEAD"].includes(init.method.toUpperCase())
  ) {
    pendingReads.clear();
    window.dispatchEvent(
      new CustomEvent("pudding-data-changed", { detail: { path } }),
    );
  }
  return result.data;
}

export const putApi = <T>(path: string, body: unknown) =>
  requestApi<T>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const deleteApi = <T>(path: string) =>
  requestApi<T>(path, { method: "DELETE" });
