/**
 * Public, storefront-safe shapes shared by the API (server) and the theme
 * widget (browser). Dependency-free on purpose: this file is bundled into
 * customer-facing JavaScript, so it must never import Prisma, server
 * utilities, or anything merchant-private.
 *
 * Deliberately absent: shop ids, access tokens, status/timestamps,
 * template ids, analytics, subscription data.
 */
import type { BundleType, DiscountType } from "@/lib/bundles/types";
import { DEFAULT_CUSTOMIZATION } from "@/lib/customization/defaults";
import type { BundleCustomization } from "@/lib/customization/types";

export const STOREFRONT_EVENTS = ["bundle_view", "bundle_add"] as const;
export type StorefrontEvent = (typeof STOREFRONT_EVENTS)[number];

/** What the widget reports. `eventId` is an idempotency key: a retry of the same action reuses it. */
export interface TrackedEvent {
  bundleId: string;
  event: StorefrontEvent;
  eventId: string;
  /** The `_bundle_instance_id` of the cart lines, for bundle_add: ties an add to a later purchase. */
  instanceId?: string;
}

export interface StorefrontVariant {
  id: string;
  title: string;
  /** Decimal string in the shop's currency, e.g. "49.00". */
  price: string | null;
  available: boolean;
}

export interface StorefrontProduct {
  /** Stable row key inside a bundle (the merchant-configured variant id). */
  key: string;
  productId: string;
  /** The merchant-configured variant (default selection). */
  variantId: string;
  /** Units per bundle (fixed) or per selected item (mix & match). */
  quantity: number;
  /** Live Shopify data; null when it couldn't be retrieved (widget degrades gracefully). */
  title: string | null;
  imageUrl: string | null;
  /** Variants of this product the customer may choose between (includes the configured one). */
  variants: StorefrontVariant[];
}

/** The public customization: exactly the validated configuration, nothing else. */
export type StorefrontCustomization = BundleCustomization;

export interface StorefrontBundle {
  id: string;
  name: string;
  description: string | null;
  type: BundleType;
  requiredQuantity: number | null;
  discount: { type: DiscountType; value: number };
  customization: StorefrontCustomization;
  productCount: number;
  products: StorefrontProduct[];
}

/**
 * Whether a bundle can be bought right now, as far as the synced catalog knows.
 * `unavailable`: a product is deleted, draft, archived or removed. `sold_out`: products
 * are live but not in stock. `unknown`: some product is not in the catalog (yet), so
 * nothing is claimed. Only the authoritative cart check can confirm a purchase.
 */
export const BUNDLE_AVAILABILITY = ["available", "sold_out", "unavailable", "unknown"] as const;
export type BundleAvailability = (typeof BUNDLE_AVAILABILITY)[number];

export interface StorefrontPreviewItem {
  title: string | null;
  imageUrl: string | null;
}

/**
 * Landing-page card: everything a card shows and nothing more. Deliberately has no variant
 * ids, product ids or per-variant data; the full StorefrontBundle is fetched on demand when
 * a customer opens one bundle.
 */
export interface StorefrontBundleCard {
  id: string;
  name: string;
  description: string | null;
  type: BundleType;
  requiredQuantity: number | null;
  discount: { type: DiscountType; value: number };
  productCount: number;
  /** Up to PREVIEW_LIMIT distinct products, in bundle order. */
  preview: StorefrontPreviewItem[];
  /** Display-only totals; only for fixed bundles whose prices are all known, else null. */
  pricing: { subtotal: number; total: number; savings: number } | null;
  availability: BundleAvailability;
  /** The bundle's own look, so the landing page card matches its product page widget. */
  customization: StorefrontCustomization;
}

export const PREVIEW_LIMIT = 4;

/** One customer choice: which product row, which variant of it, how many. */
export interface BundleSelectionItem {
  key: string;
  variantId: string;
  quantity: number;
}

/** A line for Shopify's Ajax Cart API (`/cart/add.js`). */
export interface CartLineItem {
  id: number;
  quantity: number;
  properties: Record<string, string>;
}

export { DEFAULT_CUSTOMIZATION };

/** Shopify IDs come as bare numbers or GraphQL global IDs; the storefront only deals in numeric strings. */
export function toNumericId(idOrGid: string): string {
  const match = /(\d+)$/.exec(idOrGid);
  return match ? match[1] : idOrGid;
}
