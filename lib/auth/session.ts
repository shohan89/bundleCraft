/**
 * Session cookie primitives. Deliberately framework- and runtime-agnostic
 * (no Next.js or Prisma imports) so this same code runs unmodified in
 * proxy.ts (Edge runtime, no DB access) and in Node.js API routes.
 *
 * A session token is NOT a JWT (no external library, no alg-confusion
 * surface) — it's `base64url(payload-json).base64url(hmac-signature)`,
 * signed with a key derived from SESSION_SECRET (see lib/auth/crypto.ts).
 * This layer only proves "this payload was issued by us and hasn't
 * expired." It intentionally does NOT touch the database — callers that
 * need the live Shop record (to catch uninstalled/inactive shops) use
 * `getAuthenticatedShop` in lib/auth/shopify-auth.ts instead.
 */
import {
  base64UrlDecode,
  base64UrlEncode,
  deriveSigningKey,
  signBase64Url,
  verifyBase64Url,
} from "./crypto";

export const SESSION_COOKIE_NAME = "bundlecraft_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const OAUTH_STATE_COOKIE_NAME = "bundlecraft_oauth_state";
export const OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10; // 10 minutes

const SESSION_SIGNING_PURPOSE = "session";

export interface SessionPayload {
  shopId: string;
  shopDomain: string;
  iat: number;
  exp: number;
}

function encodePayload(payload: SessionPayload): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
}

function decodePayload(encoded: string): SessionPayload | null {
  try {
    const json = new TextDecoder().decode(base64UrlDecode(encoded));
    const parsed = JSON.parse(json);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.shopId === "string" &&
      typeof parsed.shopDomain === "string" &&
      typeof parsed.iat === "number" &&
      typeof parsed.exp === "number"
    ) {
      return parsed as SessionPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/** Creates a signed, self-contained session token string for the session cookie value. */
export async function createSessionToken(
  claims: { shopId: string; shopDomain: string },
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    shopId: claims.shopId,
    shopDomain: claims.shopDomain,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = encodePayload(payload);
  const key = await deriveSigningKey(secret, SESSION_SIGNING_PURPOSE);
  const signature = await signBase64Url(key, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies signature and expiry only. Does NOT confirm the shop still
 * exists or is still active — that requires a database lookup and lives
 * in lib/auth/shopify-auth.ts's `getAuthenticatedShop`.
 */
export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;

  const key = await deriveSigningKey(secret, SESSION_SIGNING_PURPOSE);
  const isValid = await verifyBase64Url(key, encodedPayload, signature);
  if (!isValid) return null;

  const payload = decodePayload(encodedPayload);
  if (!payload) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;

  return payload;
}
