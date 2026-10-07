import { cloneDefaultCustomization } from "@/lib/customization/defaults";
import { sanitizeCustomization } from "@/lib/customization/sanitize";
import { customizationFromRow } from "@/services/customization/mapping";
import { prisma } from "@/lib/prisma";
import {
  toNumericId,
  PREVIEW_LIMIT,
  type StorefrontBundle,
  type StorefrontBundleCard,
  type StorefrontCustomization,
  type StorefrontProduct,
} from "@/lib/storefront/types";
import { bundleInclude, type BundleRow } from "@/services/bundles/shared";
import { bundleAvailability, type LineState } from "@/lib/storefront/availability";
import { computeTotals } from "@/lib/storefront/pricing";
import {
  getVariantInfo,
  getVariantSummaries,
  type VariantInfo,
  type VariantSummary,
} from "./product-info";

export interface StorefrontShop {
  id: string;
  shopDomain: string;
}

export interface StorefrontBundleQuery {
  /** "listing": the landing-page card projection (see getStorefrontListing). */
  view?: "listing";
  bundleId?: string;
  /** Numeric Shopify product id: only bundles containing this product. */
  productId?: string;
}

const LIST_LIMIT = 24;
const PRODUCT_PAGE_LIMIT = 3;

/**
 * Stored customization -> the public configuration. Anything missing or off-spec falls back to
 * the defaults field by field, so a bad stored value can never reach the storefront.
 */
export function toStorefrontCustomization(
  row: BundleRow["customization"],
): StorefrontCustomization {
  return row ? sanitizeCustomization(customizationFromRow(row)) : cloneDefaultCustomization();
}

/**
 * Internal row -> public shape. This is the only place a bundle is
 * converted for customers, so the allow-list of exposed fields lives here:
 * no shopId, status, timestamps, templateId, or analytics.
 */
export function toStorefrontBundle(
  row: BundleRow,
  info: Map<string, VariantInfo>,
): StorefrontBundle {
  const products: StorefrontProduct[] = row.bundleProducts.map((product) => {
    const variantId = toNumericId(product.shopifyVariantId);
    const live = info.get(variantId);
    return {
      key: variantId,
      productId: toNumericId(product.shopifyProductId),
      variantId,
      quantity: product.quantity,
      title: live?.productTitle ?? null,
      imageUrl: live?.imageUrl ?? null,
      variants: live?.variants ?? [],
    };
  });

  return {
    id: row.id,
    name: row.title,
    description: row.description,
    type: row.bundleType,
    requiredQuantity: row.requiredQuantity,
    discount: { type: row.discountType, value: row.discountValue.toNumber() },
    customization: toStorefrontCustomization(row.customization),
    productCount: products.length,
    products,
  };
}

/**
 * ONLY active bundles of the given shop. Drafts and inactive bundles can't
 * be returned by construction — the status filter is part of the query, not
 * a post-filter. Product details are fetched live (and only for the one to
 * three bundles a product page or detail view needs) so listing pages stay
 * cheap.
 */
export async function getStorefrontBundles(
  shop: StorefrontShop,
  query: StorefrontBundleQuery = {},
): Promise<StorefrontBundle[]> {
  const rows = await prisma.bundle.findMany({
    where: {
      shopId: shop.id,
      status: "active",
      ...(query.bundleId ? { id: query.bundleId } : {}),
      ...(query.productId
        ? {
            bundleProducts: {
              some: {
                shopifyProductId: {
                  in: [query.productId, `gid://shopify/Product/${query.productId}`],
                },
              },
            },
          }
        : {}),
    },
    include: bundleInclude,
    // One joined statement instead of one round trip per relation.
    relationLoadStrategy: "join",
    orderBy: { createdAt: "desc" },
    take: query.bundleId ? 1 : query.productId ? PRODUCT_PAGE_LIMIT : LIST_LIMIT,
  });

  const needsProductDetails = Boolean(query.bundleId || query.productId);
  const info = needsProductDetails
    ? await getVariantInfo(
        shop,
        rows.flatMap((row) => row.bundleProducts.map((product) => product.shopifyVariantId)),
      )
    : new Map<string, VariantInfo>();

  return rows.map((row) => toStorefrontBundle(row, info));
}

export function toStorefrontCard(
  row: BundleRow,
  summaries: Map<string, VariantSummary>,
): StorefrontBundleCard {
  const lines = row.bundleProducts.map((product) => ({
    product,
    summary: summaries.get(toNumericId(product.shopifyVariantId)),
  }));

  const seen = new Set<string>();
  const preview = lines
    .filter(({ product }) => {
      const key = toNumericId(product.shopifyProductId);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, PREVIEW_LIMIT)
    .map(({ summary }) => ({
      title: summary?.productTitle ?? null,
      imageUrl: summary?.imageUrl ?? null,
    }));

  const discount = { type: row.discountType, value: row.discountValue.toNumber() };
  return {
    id: row.id,
    name: row.title,
    description: row.description,
    type: row.bundleType,
    requiredQuantity: row.requiredQuantity,
    discount,
    productCount: lines.length,
    preview,
    // Only a fixed bundle has one knowable price; other types depend on the selection.
    pricing:
      row.bundleType === "fixed"
        ? computeTotals(
            lines.map(({ product, summary }) => ({
              price: summary?.price ?? null,
              quantity: product.quantity,
            })),
            discount,
          )
        : null,
    customization: toStorefrontCustomization(row.customization),
    availability: bundleAvailability(
      row.bundleType,
      lines.map(({ summary }): LineState => summary?.availability ?? "unknown"),
    ),
  };
}

/**
 * Landing page projection: ONLY active bundles of the shop (status and shop are in the
 * query), newest first, capped at LIST_LIMIT. Two queries in total however many bundles
 * there are: the bundles with their product rows, then one catalog read for all their
 * variants. Product details are cut down to what a card shows.
 */
export async function getStorefrontListing(shop: StorefrontShop): Promise<StorefrontBundleCard[]> {
  const rows = await prisma.bundle.findMany({
    where: { shopId: shop.id, status: "active" },
    include: bundleInclude,
    // One joined statement instead of one round trip per relation.
    relationLoadStrategy: "join",
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: LIST_LIMIT,
  });
  const summaries = await getVariantSummaries(
    shop,
    rows.flatMap((row) => row.bundleProducts.map((product) => product.shopifyVariantId)),
  );
  return rows.map((row) => toStorefrontCard(row, summaries));
}
