/**
 * Verification of Shopify's embedded-app SESSION TOKEN — the short-lived, signed token
 * App Bridge attaches to the browser (`window.shopify.idToken()`) so a client-side request
 * can prove which Shopify shop the merchant is currently viewing, without depending on a
 * cookie surviving a cross-site iframe (see docs/07-AUTHENTICATION.md for why this exists:
 * the dashboard's session cookie is `SameSite=None`, which some browsers refuse to send
 * from inside the Shopify admin iframe).
 *
 * A session token is a JWT, but it is verified here from scratch (HS256 only) rather than
 * with a general-purpose JWT library: Shopify signs it with the app's own client secret
 * using plain HMAC-SHA256, the exact primitive this app already uses for OAuth and webhook
 * HMACs (`lib/auth/crypto.ts`). A general JWT verifier's larger surface (other algorithms,
 * "none", key-injection headers) buys nothing here, since only one algorithm is ever valid;
 * `alg` is read from the token only to reject anything but "HS256", never trusted to select
 * the verification key.
 *
 * Framework- and runtime-agnostic (no Next.js, no Prisma): this runs unmodified in Edge
 * middleware (`proxy.ts`) and in Node API routes. It NEVER touches the database and never
 * persists a token — every call re-verifies signature and claims from scratch. Resolving the
 * live Shop record (and rejecting an inactive/uninstalled shop) is `lib/auth/shopify-auth.ts`'s
 * job, the same split as the existing session cookie.
 */
import { base64UrlDecode, importRawHmacKey, verifyBase64Url } from "./crypto";

/** What a verified token tells the caller. Never more than this leaves this module. */
export interface ShopifySessionTokenClaims {
  shopDomain: string;
  /** Epoch seconds. */
  expiresAt: number;
}

interface RawClaims {
  iss?: string;
  dest?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
}

/** Small allowance for clock drift between this server and Shopify's. */
const CLOCK_SKEW_SECONDS = 5;
const SHOP_HOST = /^https:\/\/([a-z0-9][a-z0-9-]*\.myshopify\.com)\/?$/i;
const ADMIN_ISS = /^https:\/\/([a-z0-9][a-z0-9-]*\.myshopify\.com)\/admin$/i;

function decodeJson(segment: string): unknown {
  const bytes = base64UrlDecode(segment);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function isRawClaims(value: unknown): value is Required<RawClaims> {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.iss === "string" &&
    typeof c.dest === "string" &&
    typeof c.aud === "string" &&
    typeof c.sub === "string" &&
    typeof c.exp === "number" &&
    typeof c.nbf === "number" &&
    typeof c.iat === "number" &&
    typeof c.jti === "string" &&
    c.jti.length > 0
  );
}

/**
 * Verifies a Shopify session token: HS256 signature (with the app's client secret), `aud`
 * equals the app's client id, `dest` and `iss` both name the SAME `*.myshopify.com` shop,
 * and `nbf`/`exp` bound the current time. Anything else — wrong shape, wrong algorithm, bad
 * signature, wrong audience, mismatched or malformed shop, not yet valid, or expired — is
 * `null`: a rejected token, never a partially-trusted one.
 */
export async function verifyShopifySessionToken(
  token: string,
  options: { apiKey: string; apiSecret: string; now?: () => number },
): Promise<ShopifySessionTokenClaims | null> {
  const now = (options.now ?? (() => Math.floor(Date.now() / 1000)))();

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;
  if (!headerPart || !payloadPart || !signaturePart) return null;

  let header: unknown;
  let claims: unknown;
  try {
    header = decodeJson(headerPart);
    claims = decodeJson(payloadPart);
  } catch {
    return null;
  }
  if (
    typeof header !== "object" ||
    header === null ||
    (header as { alg?: unknown }).alg !== "HS256" ||
    !["JWT", undefined].includes((header as { typ?: unknown }).typ as string | undefined)
  ) {
    return null;
  }
  if (!isRawClaims(claims)) return null;

  const key = await importRawHmacKey(options.apiSecret, ["verify"]);
  const authentic = await verifyBase64Url(key, `${headerPart}.${payloadPart}`, signaturePart);
  if (!authentic) return null;

  if (claims.aud !== options.apiKey) return null;

  const destMatch = SHOP_HOST.exec(claims.dest);
  const issMatch = ADMIN_ISS.exec(claims.iss);
  if (!destMatch || !issMatch) return null;
  const shopDomain = destMatch[1].toLowerCase();
  if (issMatch[1].toLowerCase() !== shopDomain) return null; // dest and iss must name the same shop

  if (claims.nbf - CLOCK_SKEW_SECONDS > now) return null; // not yet valid
  if (claims.iat - CLOCK_SKEW_SECONDS > now) return null; // issued in the future
  if (claims.exp <= now) return null; // expired (no leeway on this side)

  return { shopDomain, expiresAt: claims.exp };
}

/** Reads `Authorization: Bearer <token>`. `null` when the header is absent or a different scheme. */
export function bearerTokenFrom(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}
