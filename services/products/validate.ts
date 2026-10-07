import type { BundleProductInput, ValidationIssue } from "@/lib/bundles/types";
import { prisma } from "@/lib/prisma";
import { variantAvailability, type ProductAvailability } from "@/lib/products/types";

const numericId = (idOrGid: string): string => /(\d+)$/.exec(idOrGid)?.[1] ?? idOrGid;

export interface CatalogRef {
  shopifyProductId: string;
  shopifyVariantId: string;
}

export interface ResolvedRef {
  availability: ProductAvailability;
  productTitle: string | null;
  variantTitle: string | null;
  imageUrl: string | null;
  price: string | null;
}

/**
 * Looks up bundle product references in THIS shop's synced catalog, in one query.
 * The lookup is (shop, Shopify variant id) and the variant must belong to the named
 * product, so an id from another shop, an id that never existed, and a variant paired
 * with the wrong product all resolve to `unknown`, indistinguishably.
 */
export async function resolveCatalogRefs(
  shopId: string,
  refs: CatalogRef[],
): Promise<ResolvedRef[]> {
  const variantIds = [...new Set(refs.map((ref) => numericId(ref.shopifyVariantId)))];
  const rows =
    variantIds.length === 0
      ? []
      : await prisma.productVariant.findMany({
          where: { shopId, shopifyVariantId: { in: variantIds } },
          include: { product: true },
          relationLoadStrategy: "join",
        });
  const byVariant = new Map(rows.map((row) => [row.shopifyVariantId, row]));

  return refs.map((ref) => {
    const row = byVariant.get(numericId(ref.shopifyVariantId));
    if (!row || row.product.shopifyProductId !== numericId(ref.shopifyProductId)) {
      return {
        availability: "unknown",
        productTitle: null,
        variantTitle: null,
        imageUrl: null,
        price: null,
      };
    }
    return {
      availability: variantAvailability(row.product, row),
      productTitle: row.product.title,
      variantTitle: row.title,
      imageUrl: row.imageUrl ?? row.product.imageUrl,
      price: row.price?.toFixed(2) ?? null,
    };
  });
}

/**
 * Bundle validation against the synced catalog.
 *
 * - Saving (`requireBuyable: false`): every referenced product and variant must exist in
 *   this shop's catalog. That is what stops a client naming another shop's ids, or inventing
 *   them. Sold-out and even deleted products are still saveable on an existing draft, so a
 *   merchant can open a bundle to fix it.
 * - Publishing (`requireBuyable: true`): the product must be an ACTIVE product and the
 *   variant must still exist in Shopify. Deleted, draft and archived products are refused.
 *   A merely sold-out variant is allowed: stock comes and goes, and the storefront shows
 *   sold-out variants as such.
 *
 * Returns issues (empty = fine). The wording is identical for "not yours" and "does not
 * exist".
 */
export async function checkCatalogProducts(
  shopId: string,
  products: BundleProductInput[],
  options: { requireBuyable: boolean },
): Promise<ValidationIssue[]> {
  if (products.length === 0) return [];
  const resolved = await resolveCatalogRefs(shopId, products);

  const issues: ValidationIssue[] = [];
  resolved.forEach((ref, index) => {
    const field = `products[${index}].shopifyVariantId`;
    if (ref.availability === "unknown") {
      issues.push({
        field,
        code: "PRODUCT_NOT_FOUND",
        message:
          "This product isn't in your store's synced catalog. Sync your products and choose it again.",
      });
    } else if (options.requireBuyable && ref.availability === "unavailable") {
      issues.push({
        field,
        code: "PRODUCT_UNAVAILABLE",
        message: `"${ref.productTitle ?? "This product"}" is no longer available in your store. Remove or replace it before publishing.`,
      });
    }
  });
  return issues;
}
