/**
 * Structured, secret-free server logging. A log line carries what an operator needs to find a
 * problem (a request id, the route, the error class and code, a safe shop identifier, a
 * duration) and nothing that could hurt if the logs leak: no access tokens, no secrets, no
 * cookies, no request or webhook bodies, no cart or customer data, no stack traces, and no
 * query strings (App Proxy query strings carry the signature).
 *
 * Errors are reduced to `{ name, code, message }`, and the message is scrubbed (shop tokens,
 * bearer values, connection strings and `key=value` secrets) and truncated, because database
 * and network errors sometimes echo their inputs.
 */
import { randomUUID } from "node:crypto";

const REDACTED = "[redacted]";
const SECRET_PATTERNS: RegExp[] = [
  /shp[a-z]{2}_[A-Za-z0-9]{8,}/g, // Shopify access tokens and secrets
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]*:[^\s"'<>@]*@[^\s"'<>]+/gi, // URLs with credentials
  /\b(postgres(?:ql)?|mysql):\/\/[^\s"'<>]+/gi, // connection strings
  /\b(access[_-]?token|api[_-]?secret|client[_-]?secret|secret|password|authorization|cookie|hmac|signature|session)["']?\s*[:=]\s*["']?[^\s,;"'}&]+/gi,
];

export const MAX_LOGGED_MESSAGE = 300;

/** Removes anything that looks like a credential, then truncates. */
export function redact(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, REDACTED);
  return out.length > MAX_LOGGED_MESSAGE ? `${out.slice(0, MAX_LOGGED_MESSAGE)}…` : out;
}

export interface ErrorSummary {
  name: string;
  /** A database or system error code such as `P2002` or `ECONNRESET`, when there is one. */
  code?: string;
  message: string;
}

/** The loggable part of an error: never its stack, never unscrubbed text. */
export function summarizeError(error: unknown): ErrorSummary {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return {
      name: error.name,
      ...(typeof code === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(code) ? { code } : {}),
      message: redact(error.message),
    };
  }
  return { name: "NonError", message: redact(typeof error === "string" ? error : "unknown") };
}

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** A caller-supplied id if it is well formed, else a fresh one. */
export function requestIdFor(request?: Request): string {
  const supplied = request?.headers.get("x-request-id") ?? null;
  return supplied && REQUEST_ID.test(supplied) ? supplied : randomUUID();
}

/** The route and method only: no query string, no headers, no body. */
export function describeRequest(request?: Request): { route?: string; method?: string } {
  if (!request) return {};
  try {
    return { route: new URL(request.url).pathname, method: request.method };
  } catch {
    return {};
  }
}

type Fields = Record<string, string | number | boolean | null | undefined>;

/** One JSON line to stdout/stderr. Only primitive values are accepted, and strings are scrubbed. */
export function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields: Fields = {},
): void {
  const clean: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    clean[key] = typeof value === "string" ? redact(value) : value;
  }
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...clean });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/** `errorName`, `errorCode` and a scrubbed `message` for a `logEvent` call. */
export function errorFields(error: unknown): Fields {
  const summary = summarizeError(error);
  return { errorName: summary.name, errorCode: summary.code, message: summary.message };
}

/** Logs an unexpected error with its request context. Returns the request id for the response. */
export function logUnexpectedError(
  event: string,
  error: unknown,
  request?: Request,
  extra: Fields = {},
): string {
  const requestId = requestIdFor(request);
  const summary = summarizeError(error);
  logEvent("error", event, {
    requestId,
    ...describeRequest(request),
    errorName: summary.name,
    errorCode: summary.code,
    message: summary.message,
    ...extra,
  });
  return requestId;
}
