import { validateDiscount, validateRequiredQuantity } from "@/lib/bundles/rules";
import { cloneDefaultCustomization } from "@/lib/customization/defaults";
import type { TemplateDto } from "@/lib/templates/types";
import type {
  BundleCustomizationInput,
  BundleDto,
  BundleProductAvailability,
  BundleProductInput,
  BundleType,
  CustomizationLayout,
  DiscountType,
} from "@/lib/bundles/types";

export type { BundleType, CustomizationLayout, DiscountType };
export type WizardCustomization = BundleCustomizationInput;

/** What the templates API returns (validated and trimmed on the server). */
export type WizardTemplate = TemplateDto;

/** A product the merchant picked, with the display data the selector needs. Only ids and quantity are sent to the API. */
export interface WizardProduct {
  shopifyProductId: string;
  shopifyVariantId: string;
  quantity: number;
  title: string;
  variantTitle: string | null;
  imageUrl: string | null;
  price: string | null;
  /** How the product stands in the synced catalog (known when editing an existing bundle). */
  availability?: BundleProductAvailability;
}

export interface WizardState {
  templateId: string | null;
  title: string;
  bundleType: BundleType;
  /** Kept as strings while the user is typing so partial/invalid input isn't coerced away. */
  requiredQuantity: string;
  discountType: DiscountType;
  discountValue: string;
  customization: WizardCustomization;
  products: WizardProduct[];
}

export const INITIAL_WIZARD_STATE: WizardState = {
  templateId: null,
  title: "",
  bundleType: "fixed",
  requiredQuantity: "",
  discountType: "percentage",
  discountValue: "",
  customization: cloneDefaultCustomization(),
  products: [],
};

export const WIZARD_STEPS = [
  { id: "template", label: "Template" },
  { id: "products", label: "Products" },
  { id: "discount", label: "Discount" },
  { id: "design", label: "Design" },
  { id: "publish", label: "Review & publish" },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

/** Input-level checks (empty field), then the shared server rule — never a second copy of it. */
export function validateDiscountValue(type: DiscountType, rawValue: string): string | null {
  if (rawValue.trim() === "") return "Enter a discount value.";
  return validateDiscount(type, Number(rawValue))?.message ?? null;
}

export function validateRequiredQuantityInput(type: BundleType, rawValue: string): string | null {
  if (type === "fixed") return null;
  if (rawValue.trim() === "") return "Enter how many items customers must choose.";
  return validateRequiredQuantity(type, Number(rawValue))?.message ?? null;
}

const TYPE_NAME: Record<BundleType, string> = {
  fixed: "Fixed bundle",
  quantity: "Quantity bundle",
  mix_match: "Mix & match",
};

/**
 * Starting values from a template. Only the settings a template owns change (type, quantity,
 * discount, design); the merchant's products and bundle name are never touched. These are
 * defaults, not rules: the server validates whatever is finally submitted.
 */
export function applyTemplate(state: WizardState, template: WizardTemplate): WizardState {
  return {
    ...state,
    templateId: template.id,
    bundleType: template.bundleType,
    requiredQuantity: template.requiredQuantity === null ? "" : String(template.requiredQuantity),
    discountType: template.defaults.discountType,
    discountValue: String(template.defaults.discountValue),
    customization: structuredClone(template.defaults.customization),
  };
}

/** Plain-language summary of what a template sets up, for the preview. */
export function describeTemplateDefaults(
  template: WizardTemplate,
): { label: string; value: string }[] {
  const { bundleType, requiredQuantity, defaults } = template;
  const discount =
    defaults.discountType === "percentage"
      ? `${defaults.discountValue}% off`
      : `Save ${defaults.discountValue}`;
  const layout = { card: "Cards", horizontal: "Side by side", vertical: "Stacked" }[
    defaults.customization.layout
  ];
  return [
    {
      label: "Creates a",
      value:
        bundleType === "fixed"
          ? `${TYPE_NAME[bundleType]}: customers buy the whole set`
          : `${TYPE_NAME[bundleType]}: customers choose ${requiredQuantity ?? "some"} items`,
    },
    { label: "Starting discount", value: discount },
    { label: "Storefront layout", value: layout },
    { label: "Bundle name", value: defaults.title },
  ];
}

/** What the wizard sends to the API. */
export interface BundlePayload {
  title: string;
  bundleType: BundleType;
  templateId: string | null;
  requiredQuantity: number | null;
  discountType: DiscountType;
  discountValue: number;
  customization: WizardCustomization;
  products: BundleProductInput[];
}

export function wizardStateToPayload(
  state: WizardState,
  templateName: string | null,
): BundlePayload {
  return {
    title: state.title.trim() || templateName || "",
    bundleType: state.bundleType,
    templateId: state.templateId,
    requiredQuantity: state.bundleType === "fixed" ? null : Number(state.requiredQuantity),
    discountType: state.discountType,
    discountValue: Number(state.discountValue),
    customization: state.customization,
    products: state.products.map(({ shopifyProductId, shopifyVariantId, quantity }) => ({
      shopifyProductId,
      shopifyVariantId,
      quantity,
    })),
  };
}

export function bundleToWizardState(bundle: BundleDto): WizardState {
  return {
    templateId: bundle.templateId,
    title: bundle.title,
    bundleType: bundle.bundleType,
    requiredQuantity: bundle.requiredQuantity === null ? "" : String(bundle.requiredQuantity),
    discountType: bundle.discountType,
    discountValue: String(bundle.discountValue),
    customization: bundle.customization ?? cloneDefaultCustomization(),
    products: bundle.products.map((product) => ({
      shopifyProductId: product.shopifyProductId,
      shopifyVariantId: product.shopifyVariantId,
      quantity: product.quantity,
      title: product.catalog?.productTitle ?? "Product no longer in your catalog",
      variantTitle: product.catalog?.variantTitle ?? null,
      imageUrl: product.catalog?.imageUrl ?? null,
      price: product.catalog?.price ?? null,
      availability: product.catalog?.availability ?? "unknown",
    })),
  };
}
