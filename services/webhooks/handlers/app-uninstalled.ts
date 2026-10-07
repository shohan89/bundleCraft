import { invalidateStorefrontShop } from "@/lib/api/storefront";
import { prisma } from "@/lib/prisma";
import { lockShopBilling } from "@/services/billing/lock";
import type { WebhookHandler } from "../types";

/**
 * app/uninstalled. Shopify has already revoked the access token and removed the
 * app's charges and discounts, so this brings our records in line:
 *
 * - The shop becomes `inactive` and its stored token is wiped. From then on the
 *   session check, the storefront routes and every gateway refuse it.
 * - `uninstalled_at` is stamped; sessions issued at or before it can never work
 *   again, even after a reinstall makes the shop active.
 * - Paid subscriptions are closed (`cancelled`, unapproved ones `expired`) and the
 *   plan returns to Free; the rows stay as history.
 * - Bundles that were live become `inactive` and lose their (now deleted) Shopify
 *   discount reference, so nothing advertises a price checkout can no longer honour
 *   after a reinstall. They are not deleted; the merchant re-publishes them.
 * - Analytics, webhook history and every other record are kept untouched.
 *
 * Idempotent: repeating it changes nothing further. An event that predates the
 * shop's latest (re)install is stale and ignored, so a late uninstall delivery
 * cannot switch off a shop that has since reinstalled.
 */
export const handleAppUninstalled: WebhookHandler = async ({ shop, triggeredAt }) => {
  const current = await prisma.shop.findUnique({
    where: { id: shop.id },
    select: { status: true, installedAt: true, uninstalledAt: true },
  });
  if (!current) return { ignored: true };
  if (triggeredAt && triggeredAt.getTime() < current.installedAt.getTime()) {
    return { ignored: "stale" };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await lockShopBilling(tx, shop.id);

    const alreadyDone = current.status === "inactive" && current.uninstalledAt !== null;
    await tx.shop.update({
      where: { id: shop.id },
      data: {
        status: "inactive",
        accessToken: "",
        plan: "free",
        ...(alreadyDone ? {} : { uninstalledAt: now }),
      },
    });

    await tx.subscription.updateMany({
      where: { shopId: shop.id, status: "active" },
      data: { status: "cancelled", cancelledAt: now, confirmationUrl: null },
    });
    await tx.subscription.updateMany({
      where: { shopId: shop.id, status: "pending" },
      data: { status: "expired", cancelledAt: now, confirmationUrl: null },
    });

    await tx.bundle.updateMany({
      where: { shopId: shop.id, status: "active" },
      data: { status: "inactive" },
    });
    await tx.bundle.updateMany({
      where: { shopId: shop.id, shopifyDiscountId: { not: null } },
      data: { shopifyDiscountId: null, discountSyncedAt: null },
    });
  });

  // Stop serving this shop's storefront now on this instance (others: within the cache TTL).
  invalidateStorefrontShop(shop.shopDomain);

  return { uninstalled: true };
};
