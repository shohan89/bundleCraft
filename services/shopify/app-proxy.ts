/**
 * Shopify App Proxy request verification.
 *
 * The widget calls `https://<shop>/apps/bundlecraft/...` on the merchant's
 * own storefront domain; Shopify forwards it to our /api/storefront/*
 * routes and adds `shop`, `timestamp` and a `signature` computed with our
 * app secret. Verifying that signature is how a public, unauthenticated
 * request is tied to exactly one shop — a customer can't just claim to be
 * another store by editing a query parameter.
 * https://shopify.dev/docs/apps/build/online-store/display-dynamic-data#calculate-a-digital-signature
 */
import { hmacHex, timingSafeEqual } from "@/lib/auth/crypto";

/** How far a request timestamp may drift from our clock, in seconds. */
export const APP_PROXY_MAX_SKEW_SECONDS = 600;

export async function verifyAppProxySignature(
  query: URLSearchParams,
  apiSecret: string,
): Promise<boolean> {
  const provided = query.get("signature");
  if (!provided) return false;

  // Shopify's algorithm: drop `signature`, join repeated keys' values with
  // commas, sort by key, concatenate `key=value` pairs with NO separator.
  const grouped = new Map<string, string[]>();
  for (const [key, value] of query.entries()) {
    if (key === "signature") continue;
    const values = grouped.get(key);
    if (values) values.push(value);
    else grouped.set(key, [value]);
  }
  const message = [...grouped.keys()]
    .sort()
    .map((key) => `${key}=${(grouped.get(key) ?? []).join(",")}`)
    .join("");

  const expected = await hmacHex(apiSecret, message);
  return timingSafeEqual(expected, provided.toLowerCase());
}

export function isFreshTimestamp(timestamp: string | null, nowSeconds: number): boolean {
  if (!timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  return Math.abs(nowSeconds - Number(timestamp)) <= APP_PROXY_MAX_SKEW_SECONDS;
}
