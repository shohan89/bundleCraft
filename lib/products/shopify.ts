/**
 * Validation of Shopify product data, and its reduction to what BundleCraft
 * stores. Everything from Shopify's API is external input: it is parsed here
 * before any service uses it, and a product that doesn't parse is skipped
 * (counted, never half-stored) rather than trusted.
 */
import { z } from "zod";

export const PRODUCT_STATUSES = ["active", "draft", "archived"] as const;
export type SyncedProductStatus = (typeof PRODUCT_STATUSES)[number];

export interface NormalizedVariant {
  /** Numeric Shopify variant id. */
  shopifyVariantId: string;
  title: string;
  sku: string | null;
  /** Decimal string with 2 places, in the shop currency. */
  price: string | null;
  compareAtPrice: string | null;
  availableForSale: boolean;
  imageUrl: string | null;
  position: number;
}

export interface NormalizedProduct {
  /** Numeric Shopify product id. */
  shopifyProductId: string;
  title: string;
  handle: string;
  status: SyncedProductStatus;
  vendor: string | null;
  productType: string | null;
  imageUrl: string | null;
  shopifyUpdatedAt: Date;
  /** The COMPLETE variant list (the gateway follows variant pagination before handing a product over). */
  variants: NormalizedVariant[];
}

const PRODUCT_GID = /^gid:\/\/shopify\/Product\/(\d{1,20})$/;
const VARIANT_GID = /^gid:\/\/shopify\/ProductVariant\/(\d{1,20})$/;
const MAX_VARIANTS = 2048; // Shopify's own per-product ceiling
const MAX_TEXT = 500;

const money = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,4})?$/)
  .transform((value) => (Math.round(Number(value) * 100) / 100).toFixed(2))
  .nullable()
  .optional();
const image = z.object({ url: z.string() }).nullable().optional();

const variantSchema = z.object({
  id: z.string().regex(VARIANT_GID),
  title: z.string().max(MAX_TEXT),
  sku: z.string().max(MAX_TEXT).nullable().optional(),
  price: money,
  compareAtPrice: money,
  availableForSale: z.boolean(),
  image,
});

const productSchema = z.object({
  id: z.string().regex(PRODUCT_GID),
  title: z.string().max(MAX_TEXT),
  handle: z.string().max(MAX_TEXT),
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]),
  vendor: z.string().max(MAX_TEXT).nullable().optional(),
  productType: z.string().max(MAX_TEXT).nullable().optional(),
  updatedAt: z.string(),
  featuredImage: image,
  variants: z.object({ nodes: z.array(z.unknown()).max(MAX_VARIANTS) }),
});

const numeric = (gid: string, pattern: RegExp): string => pattern.exec(gid)![1];
/** Only https images are ever kept: they end up in `<img src>` on the storefront. */
const safeImage = (value: { url: string } | null | undefined): string | null =>
  value && /^https:\/\//.test(value.url) && value.url.length <= 2000 ? value.url : null;
const blankToNull = (value: string | null | undefined): string | null =>
  value && value.trim() !== "" ? value : null;

/** Returns null for anything that isn't a complete, valid product. */
export function parseShopifyProduct(node: unknown): NormalizedProduct | null {
  const product = productSchema.safeParse(node);
  if (!product.success) return null;
  const updated = new Date(product.data.updatedAt);
  if (Number.isNaN(updated.getTime())) return null;

  const variants: NormalizedVariant[] = [];
  const seen = new Set<string>();
  for (const raw of product.data.variants.nodes) {
    const variant = variantSchema.safeParse(raw);
    if (!variant.success) return null; // one bad variant makes the whole product untrustworthy
    const id = numeric(variant.data.id, VARIANT_GID);
    if (seen.has(id)) return null;
    seen.add(id);
    variants.push({
      shopifyVariantId: id,
      title: variant.data.title,
      sku: blankToNull(variant.data.sku),
      price: variant.data.price ?? null,
      compareAtPrice: variant.data.compareAtPrice ?? null,
      availableForSale: variant.data.availableForSale,
      imageUrl: safeImage(variant.data.image),
      position: variants.length,
    });
  }

  return {
    shopifyProductId: numeric(product.data.id, PRODUCT_GID),
    title: product.data.title,
    handle: product.data.handle,
    status: product.data.status.toLowerCase() as SyncedProductStatus,
    vendor: blankToNull(product.data.vendor),
    productType: blankToNull(product.data.productType),
    imageUrl: safeImage(product.data.featuredImage),
    shopifyUpdatedAt: updated,
    variants,
  };
}
