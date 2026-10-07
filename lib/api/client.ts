/**
 * Browser-side helper for calling the bundle API. Adds the CSRF header,
 * and turns every outcome — including a dead network — into a plain
 * result so components never have to handle thrown errors or raw
 * responses.
 */
import type { ValidationIssue } from "@/lib/bundles/types";
import { getBrowserSessionToken } from "./browser-session-token";
import { CSRF_HEADER, CSRF_HEADER_VALUE } from "./csrf";

export interface ApiFailure {
  code: string;
  message: string;
  details: ValidationIssue[];
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

const NETWORK_FAILURE: ApiFailure = {
  code: "NETWORK_ERROR",
  message: "Couldn't reach the server. Check your connection and try again.",
  details: [],
};

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string; details?: ValidationIssue[] };
}

export async function apiRequest<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    // A Shopify session token, when the embedded admin's App Bridge can supply one, proves
    // the shop independently of the session cookie (see lib/auth/session-token.ts). `null`
    // outside the embedded admin — the request then authenticates with the cookie, as before.
    const sessionToken = await getBrowserSessionToken();
    response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        [CSRF_HEADER]: CSRF_HEADER_VALUE,
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: NETWORK_FAILURE };
  }

  let envelope: Envelope<T> | null = null;
  try {
    envelope = (await response.json()) as Envelope<T>;
  } catch {
    envelope = null;
  }

  if (response.ok && envelope?.success && envelope.data !== undefined) {
    return { ok: true, data: envelope.data };
  }

  return {
    ok: false,
    error: {
      code: envelope?.error?.code ?? "UNKNOWN_ERROR",
      message: envelope?.error?.message ?? "Something went wrong. Please try again.",
      details: envelope?.error?.details ?? [],
    },
  };
}
