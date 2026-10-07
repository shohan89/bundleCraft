import { bundleNotFound } from "@/lib/bundles/errors";
import { prisma } from "@/lib/prisma";
import { removeBundleDiscount } from "@/services/discounts/sync";

/**
 * Deletes a bundle owned by `shopId`. Its products and customization go
 * with it via the schema's ON DELETE CASCADE, in the same statement — no
 * orphans. Merchant Shopify products are never touched (only our own
 * association rows exist).
 *
 * The bundle's Shopify discount is deleted first. For an ACTIVE bundle that
 * must succeed — otherwise checkout would keep discounting a bundle the
 * merchant no longer has — so a failure aborts the delete. For a draft or
 * inactive bundle the discount is already off, so a failure is logged and
 * the delete proceeds rather than trapping the merchant.
 *
 * Note: analytics events reference the bundle with ON DELETE CASCADE
 * (ACTION-002), so a deleted bundle's event history is removed too.
 */
export async function deleteBundle(shopId: string, bundleId: string): Promise<void> {
  const existing = await prisma.bundle.findFirst({
    where: { id: bundleId, shopId },
    select: { status: true, shopifyDiscountId: true },
  });
  if (!existing) throw bundleNotFound();

  if (existing.shopifyDiscountId) {
    try {
      await removeBundleDiscount(shopId, bundleId);
    } catch (error) {
      if (existing.status === "active") throw error;
    }
  }

  const { count } = await prisma.bundle.deleteMany({ where: { id: bundleId, shopId } });
  if (count === 0) throw bundleNotFound();
}
