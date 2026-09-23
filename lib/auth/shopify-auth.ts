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
    update: { accessToken: encryptedAccessToken, email, status: "active" },
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

  const shop = await prisma.shop.findUnique({ where: { id: payload.shopId } });
  if (!shop) return null;
  if (shop.shopDomain !== payload.shopDomain) return null;
  if (shop.status !== "active") return null;

  return { id: shop.id, shopDomain: shop.shopDomain, status: shop.status, plan: shop.plan };
}

/**
 * Decrypts a shop's stored access token. Only for server-side code that
 * needs to call the Shopify Admin API on the shop's behalf (later actions)
 * — never expose the result to a client response, log, or React component.
 */
export async function getDecryptedAccessToken(shopId: string): Promise<string | null> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return null;

  const encryptionKey = await deriveEncryptionKey(getSessionSecret(), TOKEN_ENCRYPTION_PURPOSE);
  return decryptString(encryptionKey, shop.accessToken);
}
