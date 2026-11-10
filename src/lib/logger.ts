type LogFields = Record<string, unknown>;
type LogLevel = "debug" | "info" | "warn" | "error";

const PRODUCTION_FIELDS = new Set([
  "request_id",
  "route",
  "method",
  "status",
  "http_status",
  "status_code",
  "error_code",
  "error_name",
  "provider",
  "provider_status",
  "paypal_debug_id",
  "operation",
  "job",
  "attempt",
  "duration_ms",
  "count",
  "subscription_count",
  "sent_count",
  "failed_count",
  "retryable",
  "result",
  "outcome",
  "recipient_present",
  "recipient_count",
  "component",
  "is_mock",
]);

const SENSITIVE_FIELD =
  /(^|_)(authorization|cookie|set_cookie|password|passphrase|secret|api_key|client_id|token|setup_token_id|approval_token_id|payer_id|vault_id|customer_id|email|phone|to|otp|code|state|body|payload|html|text|endpoint|device_token|p256dh|auth)(_|$)/i;
const SAFE_DIAGNOSTIC_FIELDS = new Set(["error_code", "status_code"]);
const PRODUCTION = process.env.NODE_ENV === "production";

function keyToSnakeCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[.-]/g, "_")
    .toLowerCase();
}

function scrubString(value: string): string {
  return value
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*/gi, "$1 [REDACTED]")
    .replace(/([?&](?:code|state|token|access_token|refresh_token|client_secret|approval_session_id|approval_token_id|setup_token_id)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]");
}

function sanitize(value: unknown, key = "", depth = 0, seen = new WeakSet<object>()): unknown {
  const normalizedKey = keyToSnakeCase(key);
  if (key && SENSITIVE_FIELD.test(normalizedKey) && !SAFE_DIAGNOSTIC_FIELDS.has(normalizedKey)) {
    return "[REDACTED]";
  }
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (depth >= 5) return "[TRUNCATED]";
  if (value instanceof Error) {
    return {
      name: value.name,
      ...(PRODUCTION ? {} : { message: scrubString(value.message), stack: value.stack ? scrubString(value.stack) : undefined }),
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitize(item, "", depth + 1, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      if (PRODUCTION && !PRODUCTION_FIELDS.has(keyToSnakeCase(childKey))) continue;
      output[childKey] = sanitize(childValue, childKey, depth + 1, seen);
    }
    return output;
  }
  return String(value);
}

function write(level: LogLevel, event: string, fields: LogFields = {}, error?: unknown) {
  if (PRODUCTION && level === "debug") return;

  const record: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    environment: process.env.NODE_ENV || "development",
    service: "pudding-api",
    event,
  };
  const sanitizedFields = sanitize(fields);
  if (sanitizedFields && typeof sanitizedFields === "object" && !Array.isArray(sanitizedFields)) {
    Object.assign(record, sanitizedFields);
  }
  if (error !== undefined) {
    const sanitizedError = sanitize(error, "error");
    record.error = sanitizedError;
  }

  const output = JSON.stringify(record);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else if (level === "debug") console.debug(output);
  else console.info(output);
}

/** Structured server logger. Sensitive fields are redacted in every environment;
 * production output is additionally restricted to operational fields. */
export const logger = {
  debug: (event: string, fields?: LogFields) => write("debug", event, fields),
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields, error?: unknown) => write("warn", event, fields, error),
  error: (event: string, fields?: LogFields, error?: unknown) => write("error", event, fields, error),
};
