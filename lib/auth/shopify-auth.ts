/**
 * Authentication orchestration: ties together the Shopify OAuth protocol
 * (services/shopify/oauth.ts), our session tokens (lib/auth/session.ts),
 * token-at-rest encryption (lib/auth/crypto.ts) and the Shop model
 * (lib/prisma.ts). This file is Node.js-only (it imports Prisma, which
 * uses the `pg` driver) — never import it from proxy.ts.
 */
import { prisma } from "@/lib/prisma";
import {
  buildAuthorizeUrl,
  exchangeCodeForAccessToken,
  isValidShopDomain,
  verifyOAuthHmac,
} from "@/services/shopify/oauth";
import { fetchShopEmail } from "@/services/shopify/admin";
import { deriveEncryptionKey, decryptString, encryptString, randomToken } from "./crypto";
import { createSessionToken, verifySessionToken } from "./session";
import { bearerTokenFrom, verifyShopifySessionToken } from "./session-token";

const TOKEN_ENCRYPTION_PURPOSE = "token-encryption";

export class MissingConfigError extends Error {}
export class InvalidShopError extends Error {}
export class InvalidOAuthStateError extends Error {}
export class InvalidOAuthHmacError extends Error {}
export class MissingOAuthCodeError extends Error {}
export class TokenExchangeFailedError extends Error {}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new MissingConfigError(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getSessionSecret(): string {
  return requiredEnv("SESSION_SECRET");
}

/** Validates the shop param and builds the Shopify authorize URL + a fresh OAuth state value. */
export function startOAuth(shopParam: string | null): { authorizeUrl: string; state: string } {
  if (!shopParam || !isValidShopDomain(shopParam)) {
    throw new InvalidShopError("Missing or invalid shop domain");
  }

  const apiKey = requiredEnv("SHOPIFY_API_KEY");
  const appUrl = requiredEnv("SHOPIFY_APP_URL");
  const state = randomToken(24);

  const authorizeUrl = buildAuthorizeUrl({
    shop: shopParam,
    apiKey,
    redirectUri: `${appUrl}/api/auth/callback`,
    state,
  });

  return { authorizeUrl, state };
}

/**
 * Runs the full OAuth callback flow: HMAC + state + shop validation, code
 * exchange, shop-record upsert (with the access token encrypted at rest),
 * and issues a session token for the resulting shop. Never logs the code,
 * secret, or access token.
 */
export async function completeOAuth(
  query: URLSearchParams,
  expectedState: string | undefined,
): Promise<{ sessionToken: string; shopDomain: string }> {
  const shop = query.get("shop");
  if (!shop || !isValidShopDomain(shop)) {
    throw new InvalidShopError("Missing or invalid shop domain");
  }

  const state = query.get("state");
  if (!state || !expectedState || state !== expectedState) {
    throw new InvalidOAuthStateError("OAuth state mismatch");
  }

  const apiKey = requiredEnv("SHOPIFY_API_KEY");
  const apiSecret = requiredEnv("SHOPIFY_API_SECRET");

  const hmacValid = await verifyOAuthHmac(query, apiSecret);
  if (!hmacValid) {
    throw new InvalidOAuthHmacError("OAuth HMAC verification failed");
  }

  const code = query.get("code");
  if (!code) {
    throw new MissingOAuthCodeError("Missing OAuth authorization code");
  }

  let accessToken: string;
  try {
    const exchanged = await exchangeCodeForAccessToken({ shop, apiKey, apiSecret, code });
    accessToken = exchanged.accessToken;
  } catch {
    throw new TokenExchangeFailedError("Failed to exchange authorization code for an access token");
  }

  const email = await fetchShopEmail(shop, accessToken);

  const encryptionKey = await deriveEncryptionKey(getSessionSecret(), TOKEN_ENCRYPTION_PURPOSE);
  const encryptedAccessToken = await encryptString(encryptionKey, accessToken);

  const shopRecord = await prisma.shop.upsert({
    where: { shopDomain: shop },
    // installedAt marks this (re)install; webhooks triggered before it belong to an earlier install.
    update: {
      accessToken: encryptedAccessToken,
      email,
      status: "active",
      installedAt: new Date(),
      // Products may have changed while the app was away (no webhooks): resync from scratch.
      catalogSyncStatus: "pending",
      catalogSyncCursor: null,
    },
    create: { shopDomain: shop, accessToken: encryptedAccessToken, email, status: "active" },
  });

  const sessionToken = await createSessionToken(
    { shopId: shopRecord.id, shopDomain: shopRecord.shopDomain },
    getSessionSecret(),
  );

  return { sessionToken, shopDomain: shopRecord.shopDomain };
}

export interface AuthenticatedShop {
  id: string;
  shopDomain: string;
  status: string;
  plan: string;
}

/**
 * Resolves the authenticated shop for a session cookie value. Verifies the
 * signature/expiry AND re-checks the live Shop record so a shop that was
 * marked inactive (uninstalled — see ACTION-011) stops authenticating
 * immediately, even with an otherwise still-valid session token.
 *
 * Returns null on any failure — callers must treat null as "unauthenticated"
 * and must not fall back to a client-supplied shop id.
 */
export async function getAuthenticatedShop(
  sessionCookieValue: string | undefined,
): Promise<AuthenticatedShop | null> {
  if (!sessionCookieValue) return null;

  const payload = await verifySessionToken(sessionCookieValue, getSessionSecret());
  if (!payload) return null;

  // Only the columns the check needs (never the stored access token).
  const shop = await prisma.shop.findUnique({
    where: { id: payload.shopId },
    select: { id: true, shopDomain: true, status: true, plan: true, uninstalledAt: true },
  });
  if (!shop) return null;
  if (shop.shopDomain !== payload.shopDomain) return null;
  if (shop.status !== "active") return null;
  // Sessions issued before the app was uninstalled stay dead, even after a reinstall.
  if (shop.uninstalledAt && payload.iat * 1000 <= shop.uninstalledAt.getTime()) return null;

  return { id: shop.id, shopDomain: shop.shopDomain, status: shop.status, plan: shop.plan };
}

/**
 * Resolves the authenticated shop for a Shopify embedded-app SESSION TOKEN (see
 * lib/auth/session-token.ts): verifies the token from scratch, then re-checks the live
 * Shop record exactly like `getAuthenticatedShop` does for a cookie — an inactive or
 * unknown shop authenticates as nothing, however fresh the token is.
 *
 * The Shopify access token is never involved here and never reaches the browser: a
 * session token only proves "this browser is Shopify, showing this shop, right now" —
 * it is not a credential for the Admin API and nothing about it is stored.
 */
export async function getAuthenticatedShopFromSessionToken(
  token: string,
): Promise<AuthenticatedShop | null> {
  let apiKey: string;
  let apiSecret: string;
  try {
    apiKey = requiredEnv("SHOPIFY_API_KEY");
    apiSecret = requiredEnv("SHOPIFY_API_SECRET");
  } catch {
    return null;
  }

  const claims = await verifyShopifySessionToken(token, { apiKey, apiSecret });
  if (!claims) return null;

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: claims.shopDomain },
    select: { id: true, shopDomain: true, status: true, plan: true },
  });
  if (!shop || shop.status !== "active") return null;

  return { id: shop.id, shopDomain: shop.shopDomain, status: shop.status, plan: shop.plan };
}

/**
 * The one entry point merchant API routes use (see lib/api/guard.ts). A request carrying a
 * bearer session token is authenticated from that token alone — independent of any cookie,
 * which is what lets the embedded dashboard's fetch calls keep working where a third-party
 * cookie is blocked. A PRESENT but invalid bearer token is a hard failure: it never falls
 * back to the cookie, so a forged, expired or wrong-shop token can't be rescued by a stale
 * session. Only when the request carries no bearer token at all does the cookie apply —
 * the path a full page load (which cannot attach a custom header) always takes.
 */
export async function getAuthenticatedShopForRequest(
  request: Request,
  cookieValue: string | undefined,
): Promise<AuthenticatedShop | null> {
  const bearer = bearerTokenFrom(request);
  if (bearer !== null) return getAuthenticatedShopFromSessionToken(bearer);
  return getAuthenticatedShop(cookieValue);
}

/**
 * Decrypts a shop's stored access token. Only for server-side code that
 * needs to call the Shopify Admin API on the shop's behalf (later actions)
 * — never expose the result to a client response, log, or React component.
 */
export async function getDecryptedAccessToken(shopId: string): Promise<string | null> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  // An uninstalled shop has no usable credentials (Shopify revoked the token; ours is wiped).
  if (!shop || shop.status !== "active" || !shop.accessToken) return null;

  const encryptionKey = await deriveEncryptionKey(getSessionSecret(), TOKEN_ENCRYPTION_PURPOSE);
  return decryptString(encryptionKey, shop.accessToken);
}
