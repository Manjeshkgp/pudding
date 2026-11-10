export class ClientApiError extends Error {
  constructor(message: string, public readonly status: number) {
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

export async function getApi<T>(path: string): Promise<T> {
  return requestApi<T>(path, { method: "GET" });
}

export async function patchApi<T>(path: string, body: unknown): Promise<T> {
  return requestApi<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function requestApi<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin" });
  const result = (await response.json().catch(() => null)) as
    | { success?: boolean; data?: T; error?: { message?: string } }
    | null;

  if (!response.ok || !result?.success || result.data === undefined) {
    throw new ClientApiError(
      result?.error?.message || "Something went wrong. Please try again.",
      response.status,
    );
  }

  return result.data;
}
