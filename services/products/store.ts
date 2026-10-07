import type { NormalizedProduct } from "@/lib/products/shopify";
import { prisma } from "@/lib/prisma";

/**
 * Persistence for synced products. Written as batched, parameterised
 * INSERT ... ON CONFLICT statements (one per table per page, never one per
 * variant), which is the reason this is raw SQL: a store with thousands of
 * variants would otherwise cost thousands of round trips. Values are always
 * passed as parameters (never interpolated) and every statement is scoped by shop.
 *
 * Convergence rules, enforced inside the SQL so they hold under concurrency:
 *  - identity is (shop, Shopify id): repeating a sync never duplicates anything
 *  - a `deleted` product is never revived (a stale page cannot resurrect it)
 *  - an older Shopify `updatedAt` never overwrites newer data (a late webhook or
 *    an old page cannot roll a product back)
 *  - variants are written only for products that were actually written, and a
 *    variant Shopify no longer lists is marked removed and unavailable, not deleted
 */

export interface StoreResult {
  /** Products written (created or updated). */
  written: number;
  /** Products seen but left alone because the stored data is newer or the product is deleted. */
  skipped: number;
  variants: number;
}

const iso = (date: Date) => date.toISOString();

export async function storeProducts(
  shopId: string,
  products: NormalizedProduct[],
  syncedAt: Date,
): Promise<StoreResult> {
  // One row per product id in a batch: ON CONFLICT cannot touch the same row twice.
  const latest = new Map<string, NormalizedProduct>();
  for (const product of products) {
    const existing = latest.get(product.shopifyProductId);
    if (!existing || existing.shopifyUpdatedAt <= product.shopifyUpdatedAt) {
      latest.set(product.shopifyProductId, product);
    }
  }
  const batch = [...latest.values()];
  if (batch.length === 0) return { written: 0, skipped: 0, variants: 0 };

  const now = iso(syncedAt);

  return prisma.$transaction(
    async (tx) => {
      const written = await tx.$queryRaw<{ id: string; shopify_product_id: string }[]>`
        INSERT INTO products
          (id, shop_id, shopify_product_id, title, handle, status, vendor, product_type,
           image_url, shopify_updated_at, synced_at, updated_at)
        SELECT gen_random_uuid(), ${shopId}::uuid, t.pid, t.title, t.handle, t.status::"ProductStatus",
               t.vendor, t.ptype, t.image, (t.upd::timestamptz AT TIME ZONE 'UTC'),
               (${now}::timestamptz AT TIME ZONE 'UTC'), (${now}::timestamptz AT TIME ZONE 'UTC')
        FROM unnest(
          ${batch.map((p) => p.shopifyProductId)}::text[],
          ${batch.map((p) => p.title)}::text[],
          ${batch.map((p) => p.handle)}::text[],
          ${batch.map((p) => p.status)}::text[],
          ${batch.map((p) => p.vendor)}::text[],
          ${batch.map((p) => p.productType)}::text[],
          ${batch.map((p) => p.imageUrl)}::text[],
          ${batch.map((p) => iso(p.shopifyUpdatedAt))}::text[]
        ) AS t(pid, title, handle, status, vendor, ptype, image, upd)
        ON CONFLICT (shop_id, shopify_product_id) DO UPDATE SET
          title = EXCLUDED.title,
          handle = EXCLUDED.handle,
          status = EXCLUDED.status,
          vendor = EXCLUDED.vendor,
          product_type = EXCLUDED.product_type,
          image_url = EXCLUDED.image_url,
          shopify_updated_at = EXCLUDED.shopify_updated_at,
          synced_at = EXCLUDED.synced_at,
          updated_at = EXCLUDED.updated_at
        WHERE products.status <> 'deleted'
          AND (products.shopify_updated_at IS NULL
               OR products.shopify_updated_at <= EXCLUDED.shopify_updated_at)
        RETURNING id, shopify_product_id`;

      // Every product Shopify listed counts as "seen" for this sync, even one left alone above,
      // so a full sync never mistakes it for a product that vanished.
      await tx.$executeRaw`
        UPDATE products SET synced_at = (${now}::timestamptz AT TIME ZONE 'UTC')
        WHERE shop_id = ${shopId}::uuid
          AND shopify_product_id = ANY(${batch.map((p) => p.shopifyProductId)}::text[])
          AND status <> 'deleted'`;

      const idByShopifyId = new Map(written.map((row) => [row.shopify_product_id, row.id]));
      const writtenProducts = batch.filter((p) => idByShopifyId.has(p.shopifyProductId));
      const variants = writtenProducts.flatMap((p) =>
        p.variants.map((v) => ({ productId: idByShopifyId.get(p.shopifyProductId)!, v })),
      );

      if (variants.length > 0) {
        await tx.$executeRaw`
          INSERT INTO product_variants
            (id, shop_id, product_id, shopify_variant_id, title, sku, price, compare_at_price,
             available_for_sale, image_url, position, removed_at, synced_at, updated_at)
          SELECT gen_random_uuid(), ${shopId}::uuid, t.product_id::uuid, t.vid, t.title, t.sku,
                 t.price::numeric, t.compare::numeric, t.available::boolean, t.image, t.position::int,
                 NULL, (${now}::timestamptz AT TIME ZONE 'UTC'), (${now}::timestamptz AT TIME ZONE 'UTC')
          FROM unnest(
            ${variants.map((x) => x.productId)}::text[],
            ${variants.map((x) => x.v.shopifyVariantId)}::text[],
            ${variants.map((x) => x.v.title)}::text[],
            ${variants.map((x) => x.v.sku)}::text[],
            ${variants.map((x) => x.v.price)}::text[],
            ${variants.map((x) => x.v.compareAtPrice)}::text[],
            ${variants.map((x) => String(x.v.availableForSale))}::text[],
            ${variants.map((x) => x.v.imageUrl)}::text[],
            ${variants.map((x) => String(x.v.position))}::text[]
          ) AS t(product_id, vid, title, sku, price, compare, available, image, position)
          ON CONFLICT (shop_id, shopify_variant_id) DO UPDATE SET
            product_id = EXCLUDED.product_id,
            title = EXCLUDED.title,
            sku = EXCLUDED.sku,
            price = EXCLUDED.price,
            compare_at_price = EXCLUDED.compare_at_price,
            available_for_sale = EXCLUDED.available_for_sale,
            image_url = EXCLUDED.image_url,
            position = EXCLUDED.position,
            removed_at = NULL,
            synced_at = EXCLUDED.synced_at,
            updated_at = EXCLUDED.updated_at`;
      }

      // Variants Shopify no longer lists for these products: keep the row, make it unsellable.
      if (writtenProducts.length > 0) {
        await tx.$executeRaw`
          UPDATE product_variants v
          SET removed_at = (${now}::timestamptz AT TIME ZONE 'UTC'),
              available_for_sale = false,
              updated_at = (${now}::timestamptz AT TIME ZONE 'UTC')
          FROM unnest(
            ${writtenProducts.map((p) => idByShopifyId.get(p.shopifyProductId)!)}::text[],
            ${writtenProducts.map((p) => p.variants.map((x) => x.shopifyVariantId).join(","))}::text[]
          ) AS keep(product_id, ids)
          WHERE v.shop_id = ${shopId}::uuid
            AND v.product_id = keep.product_id::uuid
            AND v.removed_at IS NULL
            AND NOT (v.shopify_variant_id = ANY(string_to_array(keep.ids, ',')))`;
      }

      return {
        written: writtenProducts.length,
        skipped: batch.length - writtenProducts.length,
        variants: variants.length,
      };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}

/**
 * The product no longer exists in Shopify. The row is kept, marked `deleted`, so
 * bundles and analytics that mention it stay readable; it can never be selected
 * or published again. If the product was never synced, a tombstone is recorded, so
 * a stale copy arriving from an in-flight full sync cannot bring it back.
 */
export async function markProductDeleted(
  shopId: string,
  shopifyProductId: string,
  at: Date,
): Promise<{ changed: boolean }> {
  await prisma.product.createMany({
    data: [
      {
        shopId,
        shopifyProductId,
        title: "(deleted product)",
        handle: "",
        status: "deleted",
        deletedAt: at,
        syncedAt: at,
      },
    ],
    skipDuplicates: true,
  });
  const updated = await prisma.product.updateMany({
    where: { shopId, shopifyProductId, status: { not: "deleted" } },
    data: { status: "deleted", deletedAt: at, syncedAt: at },
  });
  return { changed: updated.count > 0 };
}

/**
 * After a COMPLETE full sync: products that were not seen since it began no longer exist
 * in Shopify. Products written after the sync began (by a webhook) carry a newer synced_at
 * and are left alone.
 */
export async function markUnseenProductsDeleted(
  shopId: string,
  syncStartedAt: Date,
  at: Date,
): Promise<number> {
  const result = await prisma.product.updateMany({
    where: { shopId, status: { not: "deleted" }, syncedAt: { lt: syncStartedAt } },
    data: { status: "deleted", deletedAt: at },
  });
  return result.count;
}
