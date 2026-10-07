import { ApiError } from "@/lib/api/errors";
import { shopifyApiError } from "@/lib/billing/errors";
import { parseShopifyProduct } from "@/lib/products/shopify";
import { logEvent } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { ShopifyPermissionError, ShopifyThrottledError } from "@/services/shopify/products";
import { openCatalogGateway } from "./gateway";
import { markProductDeleted, markUnseenProductsDeleted, storeProducts } from "./store";

/**
 * Product and variant synchronisation. Shopify is the source of truth; this only
 * mirrors what the bundle builder and storefront need.
 *
 * Full sync (initial import, reinstall, manual "Sync products"): pages through the
 * catalog with Shopify's cursor, storing each page in one transaction. It is
 * RESUMABLE, so it fits a request: a run stops at a time budget, saves the cursor,
 * and the next call continues (no queue needed). Only a run that reaches the last page
 * marks products that vanished from Shopify as deleted. One run per shop at a time; a
 * second caller is told it is already running, and a run that died is reclaimed after
 * STALE_AFTER_MS.
 *
 * Single product (webhooks): the authoritative product is fetched from Shopify, never
 * built from the webhook payload.
 */
export const STALE_AFTER_MS = 10 * 60 * 1000;
export const DEFAULT_BUDGET_MS = 20_000;

export type CatalogSyncOutcome = "synced" | "partial" | "already_running";

export interface CatalogSyncResult {
  outcome: CatalogSyncOutcome;
  pages: number;
  products: number;
  variants: number;
  /** Shopify products that failed validation and were not stored. */
  skipped: number;
  /** Products removed locally because Shopify no longer lists them (complete runs only). */
  markedDeleted: number;
}

export interface SyncOptions {
  budgetMs?: number;
  pageSize?: number;
  /** Test seam. */
  now?: () => Date;
}

/** A short, safe code for what went wrong; the real message is never stored or shown. */
function failureCode(error: unknown): string {
  if (error instanceof ShopifyPermissionError) return "SHOPIFY_PERMISSION";
  if (error instanceof ShopifyThrottledError) return "SHOPIFY_THROTTLED";
  if (error instanceof ApiError) return error.code;
  return "SYNC_FAILED";
}

export async function syncCatalog(
  shopId: string,
  options: SyncOptions = {},
): Promise<CatalogSyncResult> {
  const now = options.now ?? (() => new Date());
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const began = Date.now();

  // Claim: nobody else is syncing this shop, or their run went stale.
  const stale = new Date(now().getTime() - STALE_AFTER_MS);
  const claimed = await prisma.shop.updateMany({
    where: {
      id: shopId,
      status: "active",
      OR: [{ catalogSyncStatus: { not: "syncing" } }, { updatedAt: { lt: stale } }],
    },
    data: { catalogSyncStatus: "syncing", catalogSyncError: null },
  });
  if (claimed.count === 0) {
    const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { status: true } });
    if (!shop || shop.status !== "active") throw shopifyApiError();
    return {
      outcome: "already_running",
      pages: 0,
      products: 0,
      variants: 0,
      skipped: 0,
      markedDeleted: 0,
    };
  }

  const result: CatalogSyncResult = {
    outcome: "partial",
    pages: 0,
    products: 0,
    variants: 0,
    skipped: 0,
    markedDeleted: 0,
  };

  try {
    const shop = await prisma.shop.findUniqueOrThrow({
      where: { id: shopId },
      select: { catalogSyncCursor: true, catalogSyncStartedAt: true },
    });
    // A fresh full sync starts a new epoch; a resumed one keeps the original.
    let cursor = shop.catalogSyncCursor;
    const startedAt = cursor && shop.catalogSyncStartedAt ? shop.catalogSyncStartedAt : now();
    if (!cursor) {
      await prisma.shop.update({
        where: { id: shopId },
        data: { catalogSyncStartedAt: startedAt },
      });
    }

    const gateway = await openCatalogGateway(shopId);
    for (;;) {
      const page = await gateway.fetchProductsPage(cursor, options.pageSize);
      const parsed = page.nodes.map(parseShopifyProduct);
      const valid = parsed.filter((p): p is NonNullable<typeof p> => p !== null);
      result.skipped += parsed.length - valid.length;

      const stored = await storeProducts(shopId, valid, now());
      result.pages += 1;
      result.products += stored.written;
      result.variants += stored.variants;

      if (!page.hasNextPage) {
        result.markedDeleted = await markUnseenProductsDeleted(shopId, startedAt, now());
        await prisma.shop.update({
          where: { id: shopId },
          data: {
            catalogSyncStatus: "synced",
            catalogSyncCursor: null,
            catalogSyncedAt: now(),
            catalogSyncError: null,
          },
        });
        result.outcome = "synced";
        return result;
      }

      cursor = page.endCursor;
      const outOfTime = Date.now() - began >= budgetMs;
      // Persist progress (also the heartbeat that keeps this run from looking stale).
      await prisma.shop.update({
        where: { id: shopId },
        data: { catalogSyncCursor: cursor, catalogSyncStatus: outOfTime ? "partial" : "syncing" },
      });
      if (outOfTime) return result;
    }
  } catch (error) {
    const code = failureCode(error);
    await prisma.shop
      .update({
        where: { id: shopId },
        data: { catalogSyncStatus: "failed", catalogSyncError: code },
      })
      .catch(() => undefined);
    logEvent("error", "catalog_sync_failed", { shopId, code, pages: result.pages });
    throw error instanceof ApiError ? error : shopifyApiError();
  }
}

/**
 * Brings ONE product in line with Shopify (product create/update webhooks, or a
 * targeted refresh). The authoritative product is fetched; if Shopify no longer has
 * it, it is marked deleted. Idempotent, and a stale copy never rolls newer data back.
 */
export async function syncProduct(
  shopId: string,
  productGid: string,
  options: { now?: () => Date } = {},
): Promise<{ result: "synced" | "deleted" | "unchanged"; variants: number }> {
  const now = (options.now ?? (() => new Date()))();
  const numericId = /(\d+)$/.exec(productGid)?.[1];
  if (!numericId) throw shopifyApiError();

  let node: unknown;
  try {
    const gateway = await openCatalogGateway(shopId);
    node = await gateway.fetchProduct(productGid);
  } catch (error) {
    logEvent("error", "product_sync_failed", { shopId, code: failureCode(error) });
    throw error instanceof ApiError ? error : shopifyApiError();
  }

  if (node === null) {
    const { changed } = await markProductDeleted(shopId, numericId, now);
    return { result: changed ? "deleted" : "unchanged", variants: 0 };
  }

  const product = parseShopifyProduct(node);
  if (!product) {
    // Shopify sent something unusable: fail (so the event is retried) rather than guess.
    logEvent("error", "product_sync_invalid_product", { shopId });
    throw shopifyApiError();
  }
  const stored = await storeProducts(shopId, [product], now);
  return { result: stored.written > 0 ? "synced" : "unchanged", variants: stored.variants };
}

/** products/delete: Shopify says it is gone. */
export async function removeProduct(
  shopId: string,
  shopifyProductId: string,
  now: Date = new Date(),
): Promise<{ changed: boolean }> {
  return markProductDeleted(shopId, shopifyProductId, now);
}
