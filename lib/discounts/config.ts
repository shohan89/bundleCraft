/**
 * The configuration handed to the Shopify Discount Function (ACTION-007).
 *
 * The Function has no network access and cannot read our database, so
 * everything it may rely on — which products make up the bundle, the
 * discount type and value — is written here, server-side, into an
 * app-owned metafield on the Shopify discount. Customers can edit cart line
 * properties but cannot write app-owned metafields, so this is the trust
 * boundary. The consuming parser (extensions/bundle-discount/src/config.ts)
 * re-validates the shape on every run; discounts.contract.test.ts keeps the
 * two in step.
 */
import { validateDiscount } from "@/lib/bundles/rules";
import type { BundleType, DiscountType } from "@/lib/bundles/types";

/** `$app:` resolves to this app's private namespace; other apps can't read or write it. */
export const DISCOUNT_METAFIELD_NAMESPACE = "$app:bundlecraft";
export const DISCOUNT_METAFIELD_KEY = "config";
export const DISCOUNT_CONFIG_VERSION = 1;
/** The Function extension's handle (extensions/bundle-discount/shopify.extension.toml). */
export const DISCOUNT_FUNCTION_HANDLE = "bundle-discount";

export interface DiscountConfig {
  version: typeof DISCOUNT_CONFIG_VERSION;
  bundleId: string;
  name: string;
  type: BundleType;
  requiredQuantity: number | null;
  discount: { type: DiscountType; value: number };
  currencyCode: string;
  rows: { productId: string; variantId: string; quantity: number }[];
}

export interface DiscountConfigSource {
  id: string;
  title: string;
  bundleType: BundleType;
  requiredQuantity: number | null;
  discountType: DiscountType;
  /** Prisma Decimal or number. */
  discountValue: { toNumber(): number } | number;
  bundleProducts: { shopifyProductId: string; shopifyVariantId: string; quantity: number }[];
}

const numericId = (idOrGid: string): string => /(\d+)$/.exec(idOrGid)?.[1] ?? idOrGid;

/**
 * Builds the config from a stored bundle. Throws if the bundle can't be
 * expressed as a valid discount: the discount is then never synced, rather
 * than being synced with values the Function would have to reject.
 */
export function buildDiscountConfig(
  bundle: DiscountConfigSource,
  currencyCode: string,
): DiscountConfig {
  const value =
    typeof bundle.discountValue === "number"
      ? bundle.discountValue
      : bundle.discountValue.toNumber();

  const issue = validateDiscount(bundle.discountType, value);
  if (issue) throw new RangeError(`Bundle ${bundle.id} has an invalid discount: ${issue.message}`);
  if (bundle.bundleProducts.length === 0) {
    throw new RangeError(`Bundle ${bundle.id} has no products.`);
  }
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new RangeError("Shop currency code is missing or invalid.");
  }

  return {
    version: DISCOUNT_CONFIG_VERSION,
    bundleId: bundle.id,
    name: bundle.title,
    type: bundle.bundleType,
    requiredQuantity: bundle.bundleType === "fixed" ? null : bundle.requiredQuantity,
    discount: { type: bundle.discountType, value },
    currencyCode,
    rows: bundle.bundleProducts.map((product) => ({
      productId: numericId(product.shopifyProductId),
      variantId: numericId(product.shopifyVariantId),
      quantity: product.quantity,
    })),
  };
}
