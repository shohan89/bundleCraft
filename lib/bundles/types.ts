/**
 * Bundle domain types. Deliberately free of any Prisma runtime import so
 * client components (the wizard) can share the same unions and rules as
 * the server.
 */
import type { BundleCustomization } from "@/lib/customization/types";

export const BUNDLE_TYPES = ["fixed", "quantity", "mix_match"] as const;
export type BundleType = (typeof BUNDLE_TYPES)[number];

export const BUNDLE_STATUSES = ["draft", "active", "inactive"] as const;
export type BundleStatus = (typeof BUNDLE_STATUSES)[number];

export const DISCOUNT_TYPES = ["percentage", "fixed_amount"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

// Customization has one home (lib/customization); re-exported so bundle code keeps its imports.
export { CUSTOMIZATION_LAYOUTS } from "@/lib/customization/types";
export type { CustomizationLayout } from "@/lib/customization/types";

export interface BundleProductInput {
  shopifyProductId: string;
  shopifyVariantId: string;
  quantity: number;
}

export type BundleCustomizationInput = BundleCustomization;

/** Everything a merchant can set on a bundle. Status is never client-settable. */
export interface BundleDraftInput {
  title: string;
  description: string | null;
  bundleType: BundleType;
  templateId: string | null;
  requiredQuantity: number | null;
  discountType: DiscountType;
  discountValue: number;
  products: BundleProductInput[];
  customization: BundleCustomizationInput | null;
}

/** PATCH body: any subset of the draft input. */
export type BundleDraftPatch = Partial<BundleDraftInput>;

/** How a bundle's product stands in the shop's synced Shopify catalog (see lib/products/types.ts). */
export type BundleProductAvailability = "available" | "sold_out" | "unavailable" | "unknown";

export interface BundleProductCatalogInfo {
  availability: BundleProductAvailability;
  productTitle: string | null;
  variantTitle: string | null;
  imageUrl: string | null;
  price: string | null;
}

export interface BundleProductDto extends BundleProductInput {
  id: string;
  position: number;
  /** Present on single-bundle reads; lets the dashboard name products and flag ones needing attention. */
  catalog?: BundleProductCatalogInfo;
}

/** API/dashboard representation. Intentionally omits shopId and other internals. */
export interface BundleDto extends BundleDraftInput {
  id: string;
  status: BundleStatus;
  products: BundleProductDto[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
}

export interface BundleValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
}
