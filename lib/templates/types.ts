/**
 * Template domain types. Free of any Prisma runtime import so the dashboard (client
 * components) shares them with the server. A template is a starting blueprint for a
 * bundle: it is never a bundle type and never holds merchant products.
 */
import type { BundleCustomizationInput, BundleType, DiscountType } from "@/lib/bundles/types";

export const TEMPLATE_CATEGORIES = ["fashion", "beauty"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_CATEGORY_LABEL: Record<TemplateCategory, string> = {
  fashion: "Fashion",
  beauty: "Beauty",
};

/** A suggested role for one product, e.g. "Top" or "Cleanser". Guidance only, never enforced. */
export interface TemplateSection {
  key: string;
  label: string;
  hint: string;
}

/** The validated shape of `templates.configuration_json`. */
export interface TemplateConfiguration {
  version: 1;
  description: string;
  intendedUse: string;
  /** Used as the bundle name until the merchant types one. */
  titleSuggestion: string;
  bundleType: BundleType;
  /** Only for quantity and mix & match bundles: how many items a customer picks. */
  requiredQuantity: number | null;
  suggestedProductCount: number;
  sections: TemplateSection[];
  discount: { type: DiscountType; value: number };
  customization: BundleCustomizationInput;
}

/** What the wizard receives: safe fields only, no database internals. */
export interface TemplateDto {
  id: string;
  slug: string;
  name: string;
  category: TemplateCategory;
  description: string;
  intendedUse: string;
  bundleType: BundleType;
  requiredQuantity: number | null;
  suggestedProductCount: number;
  sections: TemplateSection[];
  defaults: {
    title: string;
    discountType: DiscountType;
    discountValue: number;
    customization: BundleCustomizationInput;
  };
}
