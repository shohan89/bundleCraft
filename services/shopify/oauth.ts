/**
 * Shopify OAuth 2.0 protocol helpers. This module only talks to Shopify's
 * documented OAuth surface (https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant)
 * — it has no knowledge of our session model or database and imports
 * nothing from lib/auth or lib/prisma.
 */
import { hmacHex, timingSafeEqual } from "@/lib/auth/crypto";

/**
 * Kept in sync with shopify.app.toml's [access_scopes] and the
 * "Required Shopify Permissions" list in docs/05-SHOPIFY_INTEGRATION.md /
 * tasks/phase-03-authentication/shopify-auth.md.
 */
export const SHOPIFY_SCOPES = ["read_products", "read_orders", "write_themes"] as const;

const SHOP_DOMAIN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

/**
 * Validates a shop domain against Shopify's documented format before it is
 * used to build any URL or database lookup. Rejects anything that isn't
 * exactly `<name>.myshopify.com` (no path, query string, port, or other
 * host).
 */
export function isValidShopDomain(shop: string): boolean {
  return SHOP_DOMAIN_PATTERN.test(shop);
}

export function buildAuthorizeUrl(params: {
  shop: string;
  apiKey: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(`https://${params.shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", params.apiKey);
  url.searchParams.set("scope", SHOPIFY_SCOPES.join(","));
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  return url.toString();
}

/**
 * Verifies the `hmac` query parameter Shopify attaches to the OAuth
 * callback request, per Shopify's documented algorithm: every param except
 * `hmac` and `signature`, with `%` and `&` percent-encoded in keys/values,
 * sorted by key, joined with `&`, HMAC-SHA256'd with the app's API secret.
 */
export async function verifyOAuthHmac(
  query: URLSearchParams,
  apiSecret: string,
): Promise<boolean> {
  const providedHmac = query.get("hmac");
  if (!providedHmac) return false;

  const escape = (value: string) => value.replace(/%/g, "%25").replace(/&/g, "%26");

  const pairs: string[] = [];
  for (const [key, value] of query.entries()) {
    if (key === "hmac" || key === "signature") continue;
    pairs.push(`${escape(key)}=${escape(value)}`);
  }
  pairs.sort();
  const message = pairs.join("&");

  const computedHmac = await hmacHex(apiSecret, message);
  return timingSafeEqual(computedHmac, providedHmac);
}

export class OAuthTokenExchangeError extends Error {}

/**
 * Exchanges an OAuth authorization code for a permanent access token.
 * Never logs the code, secret, or resulting token.
 */
export async function exchangeCodeForAccessToken(params: {
  shop: string;
  apiKey: string;
  apiSecret: string;
  code: string;
}): Promise<{ accessToken: string; scope: string }> {
  const response = await fetch(`https://${params.shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: params.apiKey,
      client_secret: params.apiSecret,
      code: params.code,
    }),
  });

  if (!response.ok) {
    throw new OAuthTokenExchangeError(`Shopify token exchange failed with status ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string; scope?: string };
  if (!data.access_token || !data.scope) {
    throw new OAuthTokenExchangeError("Shopify token exchange response was missing required fields");
  }

  return { accessToken: data.access_token, scope: data.scope };
}
