import { ApiError } from "@/lib/api-response";

export const pageSize = 15;
export function pageCursor(params: URLSearchParams) {
  const token = params.get("cursor");
  if (!token) return null;
  const match = /^([A-Za-z0-9_-]{1,128})\.(\d{1,15})$/.exec(token);
  if (!match) throw new ApiError(400, "Invalid page cursor.", "INVALID_CURSOR");
  const date = new Date(Number(match[2]));
  if (!Number.isFinite(date.getTime()))
    throw new ApiError(400, "Invalid page cursor.", "INVALID_CURSOR");
  return { id: match[1], date };
}

export function olderThan<K extends "createdAt" | "submittedAt">(
  field: K,
  cursor: ReturnType<typeof pageCursor>,
) {
  if (!cursor) return {};
  return {
    OR: [
      { [field]: { lt: cursor.date } } as Record<K, { lt: Date }>,
      {
        ...({ [field]: cursor.date } as Record<K, Date>),
        id: { lt: cursor.id },
      },
    ],
  };
}

export function takePage<
  T extends { id: string },
  K extends "createdAt" | "submittedAt",
>(rows: (T & Record<K, Date>)[], field: K) {
  const items = rows.slice(0, pageSize);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > pageSize && last
        ? `${last.id}.${last[field].getTime()}`
        : null,
  };
}
