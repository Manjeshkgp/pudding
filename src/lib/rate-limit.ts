import { ApiError } from "./api-response";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

// Periodically clean up expired buckets in memory
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }, 60_000).unref?.();
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
  errorMessage?: string;
}

export function enforceRateLimit({
  key,
  limit,
  windowMs,
  errorMessage = "Too many requests. Please try again later.",
}: RateLimitOptions): { remaining: number; resetAt: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    const retryAfterSec = Math.ceil((existing.resetAt - now) / 1000);
    throw new ApiError(429, errorMessage, "RATE_LIMIT_EXCEEDED", {
      retryAfterSeconds: retryAfterSec,
    });
  }

  existing.count += 1;
  return {
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  };
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
