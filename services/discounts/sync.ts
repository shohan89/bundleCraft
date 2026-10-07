import { ApiError } from "@/lib/api/errors";
import { discountPermissionRequired, discountSyncFailed } from "@/lib/bundles/errors";
import { buildDiscountConfig, type DiscountConfig } from "@/lib/discounts/config";
import { errorFields, logEvent } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { ShopifyPermissionError } from "@/services/shopify/discounts";
import type { BundleRow } from "@/services/bundles/shared";
import { openDiscountGateway } from "./gateway";

/**
 * Keeps the Shopify automatic discount in step with a bundle. Every function
 * is idempotent — safe to repeat after a timeout or partial failure — and
 * scoped by `shopId`: a bundle id from another tenant matches no row, so
 * nothing is read, created, or changed for it.
 *
 * The stored `shopifyDiscountId` is the only link between the two systems:
 * one bundle, one discount, reused for the bundle's lifetime. If the
 * merchant deletes the discount in Shopify admin, the next publish notices
 * ("not found") and creates a fresh one.
 */

/** Converts anything a sync can throw into a merchant-safe ApiError. */
function toSyncError(error: unknown, context: { shopId: string; bundleId: string }): ApiError {
  if (error instanceof ApiError) return error;
  // Only the message is logged: the client never puts tokens or bodies in it.
  logEvent("error", "discount_sync_failed", { ...context, ...errorFields(error) });
  return error instanceof ShopifyPermissionError
    ? discountPermissionRequired()
    : discountSyncFailed();
}

export interface SyncedDiscount {
  discountId: string;
  config: DiscountConfig;
}

/**
 * Makes the bundle's discount exist, carry the bundle's current
 * configuration, and be active. Creates it on first use.
 */
export async function enableBundleDiscount(
  shopId: string,
  bundle: BundleRow,
  attempt = 0,
): Promise<SyncedDiscount> {
  const context = { shopId, bundleId: bundle.id };
  try {
    if (bundle.shopId !== shopId) throw discountSyncFailed(); // defence in depth
    const gateway = await openDiscountGateway(shopId);
    const config = buildDiscountConfig(bundle, await gateway.fetchShopCurrency());

    let discountId = bundle.shopifyDiscountId;
    if (discountId) {
      const updated = await gateway.updateDiscount(discountId, bundle.title, config);
      const activated = updated === "ok" ? await gateway.setActive(discountId, true) : "not_found";
      if (activated === "not_found") {
        // Deleted in Shopify admin: forget the stale reference and create a new one below.
        await prisma.bundle.updateMany({
          where: { id: bundle.id, shopId, shopifyDiscountId: discountId },
          data: { shopifyDiscountId: null },
        });
        discountId = null;
      } else {
        return { discountId, config };
      }
    }

    const created = await gateway.createDiscount(bundle.title, config);
    // Compare-and-set on "no discount yet": if a concurrent publish stored one first,
    // ours is redundant. Delete it (best effort) and converge on the stored one.
    const { count } = await prisma.bundle.updateMany({
      where: { id: bundle.id, shopId, shopifyDiscountId: null },
      data: { shopifyDiscountId: created },
    });
    if (count === 1) return { discountId: created, config };

    await gateway.deleteDiscount(created).catch(() => undefined);
    const current = await prisma.bundle.findFirst({
      where: { id: bundle.id, shopId },
      include: { bundleProducts: { orderBy: { position: "asc" } }, customization: true },
    });
    if (!current || attempt >= 1) throw discountSyncFailed();
    return enableBundleDiscount(shopId, current, attempt + 1);
  } catch (error) {
    throw toSyncError(error, context);
  }
}

/**
 * Turns the bundle's discount off (kept, so re-publishing reuses it). A
 * bundle that never had a discount, or whose discount is already gone, is
 * a successful no-op.
 */
export async function disableBundleDiscount(shopId: string, bundleId: string): Promise<void> {
  const context = { shopId, bundleId };
  try {
    const bundle = await prisma.bundle.findFirst({
      where: { id: bundleId, shopId },
      select: { shopifyDiscountId: true },
    });
    const discountId = bundle?.shopifyDiscountId;
    if (!discountId) return;

    const gateway = await openDiscountGateway(shopId);
    const result = await gateway.setActive(discountId, false);
    if (result === "not_found") {
      await prisma.bundle.updateMany({
        where: { id: bundleId, shopId, shopifyDiscountId: discountId },
        data: { shopifyDiscountId: null },
      });
    }
  } catch (error) {
    throw toSyncError(error, context);
  }
}

/** Deletes the bundle's discount from Shopify (used before the bundle row is deleted). */
export async function removeBundleDiscount(shopId: string, bundleId: string): Promise<void> {
  const context = { shopId, bundleId };
  try {
    const bundle = await prisma.bundle.findFirst({
      where: { id: bundleId, shopId },
      select: { shopifyDiscountId: true },
    });
    const discountId = bundle?.shopifyDiscountId;
    if (!discountId) return;

    const gateway = await openDiscountGateway(shopId);
    await gateway.deleteDiscount(discountId); // "not_found" already means gone
    await prisma.bundle.updateMany({
      where: { id: bundleId, shopId, shopifyDiscountId: discountId },
      data: { shopifyDiscountId: null },
    });
  } catch (error) {
    throw toSyncError(error, context);
  }
}
