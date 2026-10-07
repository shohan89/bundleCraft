import { NextResponse } from "next/server";
import { logEvent } from "@/lib/log";
import { createTtlCache, ttlFromEnv } from "@/lib/cache/ttl";
import { prisma } from "@/lib/prisma";
import { isValidShopDomain } from "@/services/shopify/oauth";
import { isFreshTimestamp, verifyAppProxySignature } from "@/services/shopify/app-proxy";
import type { StorefrontShop } from "@/services/storefront/bundles";
import { ApiError } from "./errors";

/**
 * The verified shop for a signed storefront domain, remembered briefly so a page full of widgets
 * (and the cart and event calls after it) does not repeat the same one-row lookup. Safe because:
 * the key is the shop domain that Shopify's signature just vouched for (so it is tenant
 * isolated by construction); only ACTIVE shops are stored; it holds two public-ish fields (the
 * internal id and the domain), no token or plan; and the app-uninstalled webhook removes the
 * entry. Per process (see lib/cache/ttl.ts): on other instances an uninstall can take up to the
 * TTL (30 s by default, the same window public responses are already cached for) to be seen.
 */
const shopCache = createTtlCache<StorefrontShop>({
  ttlMs: ttlFromEnv("STOREFRONT_SHOP_CACHE_MS", 30_000),
  maxEntries: 2000,
});

/** Forget a shop now (called when it uninstalls). */
export function invalidateStorefrontShop(shopDomain: string): void {
  shopCache.delete(shopDomain);
}

export const clearStorefrontShopCache = (): void => shopCache.clear();

/**
 * Identifies the shop behind a PUBLIC storefront request. There is no
 * merchant session here (customers aren't logged in to anything of ours);
 * the only trusted identity is Shopify's App Proxy signature, computed
 * with our app secret over the request. Unsigned or tampered requests are
 * rejected before any data is touched, and the shop is resolved from the
 * signed `shop` value — never from anything else in the request.
 */
export async function authenticateStorefrontRequest(request: Request): Promise<StorefrontShop> {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    logEvent("error", "storefront_secret_missing");
    throw new ApiError("INTERNAL_ERROR", "Something went wrong. Please try again.", 500);
  }

  const params = new URL(request.url).searchParams;
  const verified =
    (await verifyAppProxySignature(params, secret)) &&
    isFreshTimestamp(params.get("timestamp"), Math.floor(Date.now() / 1000));
  if (!verified) {
    throw new ApiError("UNAUTHORIZED", "Request could not be verified.", 401);
  }

  const shopDomain = params.get("shop");
  if (!shopDomain || !isValidShopDomain(shopDomain)) {
    throw new ApiError("INVALID_REQUEST", "Invalid request.", 400);
  }

  const cached = shopCache.get(shopDomain);
  if (cached) return cached;

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true, shopDomain: true, status: true },
  });
  // An uninstalled/inactive store serves no bundles, indistinguishable
  // from a store that has none.
  if (!shop || shop.status !== "active") {
    throw new ApiError("BUNDLE_NOT_FOUND", "This bundle is currently unavailable.", 404);
  }
  const result = { id: shop.id, shopDomain: shop.shopDomain };
  shopCache.set(shopDomain, result);
  return result;
}

/**
 * Public data may be cached briefly by the browser/CDN so a product page
 * full of widgets is cheap. The window is deliberately short: when a bundle
 * is deactivated the storefront stops showing it within about a minute.
 */
export function publicJson<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(
    { success: true, data },
    {
      status,
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=30" },
    },
  );
}

/** Responses to actions (cart preparation, events) are never cacheable. */
export function actionJson<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(
    { success: true, data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
