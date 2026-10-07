import { NextResponse } from "next/server";
import { logUnexpectedError } from "@/lib/log";
import { ApiError } from "./errors";

// Merchant data must never be cached by a browser or shared cache.
const NO_STORE = { "Cache-Control": "no-store" };

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status, headers: NO_STORE });
}

/**
 * The single place an error becomes an HTTP response. ApiErrors carry
 * merchant-safe messages; anything else (database errors, bugs) is logged
 * server-side and reported as a generic 500 — never its message or stack.
 */
export function toErrorResponse(error: unknown, request?: Request): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      {
        status: error.status,
        headers: {
          ...NO_STORE,
          ...(error.options.retryAfterSeconds
            ? { "Retry-After": String(error.options.retryAfterSeconds) }
            : {}),
        },
      },
    );
  }

  // Logged as one scrubbed JSON line (no stack, no query string, no body). The id is returned so
  // support can find the line from what the merchant or shopper reports.
  const requestId = logUnexpectedError("api_unexpected_error", error, request);
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
        requestId,
      },
    },
    { status: 500, headers: { ...NO_STORE, "X-Request-Id": requestId } },
  );
}
