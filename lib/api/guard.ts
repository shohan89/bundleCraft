import { cookies } from "next/headers";
import { getAuthenticatedShopForRequest, type AuthenticatedShop } from "@/lib/auth/shopify-auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { bundleIdSchema } from "@/lib/bundles/validation";
import { CSRF_HEADER, CSRF_HEADER_VALUE } from "./csrf";
import { MAX_JSON_BODY_BYTES, readBoundedText } from "./body";
import { ApiError } from "./errors";

/**
 * The session cookie is SameSite=None (the dashboard runs in a Shopify
 * admin iframe), so browsers attach it to cross-site requests too. To
 * stop another site from triggering state changes with a merchant's
 * cookie, every non-GET request must carry this custom header. A
 * cross-site page can't add it without a CORS preflight, and we send no
 * CORS headers, so the browser blocks it.
 */
export { CSRF_HEADER, CSRF_HEADER_VALUE };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Authoritative API authentication: re-verifies the session and the live Shop record
 * (proxy.ts only does the cheap edge pre-check). Accepts EITHER a Shopify embedded-app
 * session token (`Authorization: Bearer ...`, see lib/auth/session-token.ts) or the
 * session cookie — a bearer token, when present, is authenticated on its own and never
 * falls back to the cookie. The returned shop is the only tenant identity a handler may
 * use — never anything from the URL, query string, or body.
 */
export async function authenticateApiRequest(request: Request): Promise<AuthenticatedShop> {
  const cookieStore = await cookies();
  const shop = await getAuthenticatedShopForRequest(
    request,
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );
  if (!shop) {
    throw new ApiError("UNAUTHORIZED", "Authentication required.", 401);
  }

  if (!SAFE_METHODS.has(request.method) && request.headers.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
    throw new ApiError("FORBIDDEN", "Request rejected.", 403);
  }

  return shop;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  // Size first (413), then shape (400): an oversized body is never parsed.
  const text = await readBoundedText(request, MAX_JSON_BODY_BYTES);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("INVALID_REQUEST", "Request body must be valid JSON.", 400);
  }
}

export function parseBundleId(raw: string): string {
  const parsed = bundleIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("INVALID_REQUEST", "Invalid bundle id.", 400);
  }
  return parsed.data;
}
