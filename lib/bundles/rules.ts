/**
 * The single home for bundle business rules. Pure functions only — no
 * database, no HTTP, no Prisma runtime import — so the API, the services,
 * and the dashboard wizard all enforce exactly the same rules.
 */
import { validateCustomization as validateCustomizationRules } from "@/lib/customization/validation";
import {
  BUNDLE_TYPES,
  DISCOUNT_TYPES,
  type BundleCustomizationInput,
  type BundleDraftInput,
  type BundleProductInput,
  type BundleStatus,
  type BundleType,
  type DiscountType,
  type ValidationIssue,
} from "./types";

export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 1000;
export const MAX_PRODUCTS_PER_BUNDLE = 50;
export const MAX_PRODUCT_QUANTITY = 100;
export const MAX_REQUIRED_QUANTITY = 100;
export const MAX_FIXED_DISCOUNT = 99_999_999.99; // bundles.discount_value is DECIMAL(10,2)
export { FONT_SIZE_MAX, FONT_SIZE_MIN } from "@/lib/customization/types";

// Shopify IDs arrive either as bare numeric IDs or as GraphQL global IDs.
const PRODUCT_ID_PATTERN = /^(\d{1,20}|gid:\/\/shopify\/Product\/\d{1,20})$/;
const VARIANT_ID_PATTERN = /^(\d{1,20}|gid:\/\/shopify\/ProductVariant\/\d{1,20})$/;

type Rule = Pick<ValidationIssue, "code" | "message">;

function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

// ---------------------------------------------------------------------------
// Discount
// ---------------------------------------------------------------------------

/** The one discount rule, used by create/update/validate/publish and the wizard UI. */
export function validateDiscount(type: DiscountType, value: number): Rule | null {
  if (!Number.isFinite(value))
    return { code: "INVALID_DISCOUNT", message: "Enter a valid number." };
  if (value <= 0) return { code: "INVALID_DISCOUNT", message: "Discount must be greater than 0." };
  if (type === "percentage" && value > 100) {
    return { code: "INVALID_DISCOUNT", message: "Percentage discount can't exceed 100%." };
  }
  if (type === "fixed_amount" && value > MAX_FIXED_DISCOUNT) {
    return { code: "INVALID_DISCOUNT", message: "Fixed discount amount is too large." };
  }
  if (!hasAtMostTwoDecimals(value)) {
    return { code: "INVALID_DISCOUNT", message: "Discount can have at most 2 decimal places." };
  }
  return null;
}

/**
 * Reusable discount calculation (docs/09-BUNDLE_ENGINE.md). Storage and
 * validation only in this action — applying it at checkout is ACTION-007.
 */
export function calculateDiscountedPrice(
  totalPrice: number,
  type: DiscountType,
  value: number,
): number {
  if (validateDiscount(type, value) !== null) {
    throw new RangeError("Cannot calculate a price with an invalid discount.");
  }
  const discounted =
    type === "percentage" ? totalPrice - (totalPrice * value) / 100 : totalPrice - value;
  return Math.round(Math.max(0, discounted) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Required quantity ("Choose any 3")
// ---------------------------------------------------------------------------

/** `null` is allowed here (a draft may not have it yet); publish readiness requires it separately. */
export function validateRequiredQuantity(
  bundleType: BundleType,
  value: number | null,
): Rule | null {
  if (bundleType === "fixed") {
    return value === null
      ? null
      : { code: "INVALID_QUANTITY", message: "Required quantity doesn't apply to fixed bundles." };
  }
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1 || value > MAX_REQUIRED_QUANTITY) {
    return {
      code: "INVALID_QUANTITY",
      message: `Required quantity must be a whole number from 1 to ${MAX_REQUIRED_QUANTITY}.`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Draft validation (what must hold for a bundle to be saved at all)
// ---------------------------------------------------------------------------

function validateProducts(products: BundleProductInput[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (products.length > MAX_PRODUCTS_PER_BUNDLE) {
    issues.push({
      field: "products",
      code: "INVALID_PRODUCT",
      message: `A bundle can have at most ${MAX_PRODUCTS_PER_BUNDLE} products.`,
    });
  }

  const seenVariants = new Set<string>();
  products.forEach((product, index) => {
    const at = `products[${index}]`;
    if (!PRODUCT_ID_PATTERN.test(product.shopifyProductId)) {
      issues.push({
        field: `${at}.shopifyProductId`,
        code: "INVALID_PRODUCT",
        message: "Product ID isn't a valid Shopify product ID.",
      });
    }
    if (!VARIANT_ID_PATTERN.test(product.shopifyVariantId)) {
      issues.push({
        field: `${at}.shopifyVariantId`,
        code: "INVALID_PRODUCT",
        message: "Variant ID isn't a valid Shopify variant ID.",
      });
    } else if (seenVariants.has(product.shopifyVariantId)) {
      issues.push({
        field: `${at}.shopifyVariantId`,
        code: "DUPLICATE_PRODUCT",
        message: "The same variant can't be added to a bundle twice.",
      });
    }
    seenVariants.add(product.shopifyVariantId);

    if (
      !Number.isInteger(product.quantity) ||
      product.quantity < 1 ||
      product.quantity > MAX_PRODUCT_QUANTITY
    ) {
      issues.push({
        field: `${at}.quantity`,
        code: "INVALID_QUANTITY",
        message: `Quantity must be a whole number from 1 to ${MAX_PRODUCT_QUANTITY}.`,
      });
    }
  });

  return issues;
}

function validateCustomization(customization: BundleCustomizationInput): ValidationIssue[] {
  // The rules live in lib/customization (colours, options, bounds); this only reports them.
  return validateCustomizationRules(customization);
}

/** Trims text fields and treats a blank description as absent. */
export function normalizeDraft(input: BundleDraftInput): BundleDraftInput {
  const description = input.description?.trim() ?? "";
  return {
    ...input,
    title: input.title.trim(),
    description: description === "" ? null : description,
  };
}

/** A draft may be incomplete (e.g. no products yet) but must never be inconsistent. */
export function validateBundleDraft(input: BundleDraftInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (input.title.trim().length === 0) {
    issues.push({ field: "title", code: "REQUIRED", message: "Bundle name is required." });
  } else if (input.title.trim().length > TITLE_MAX_LENGTH) {
    issues.push({
      field: "title",
      code: "TOO_LONG",
      message: `Bundle name can be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if ((input.description?.trim().length ?? 0) > DESCRIPTION_MAX_LENGTH) {
    issues.push({
      field: "description",
      code: "TOO_LONG",
      message: `Description can be at most ${DESCRIPTION_MAX_LENGTH} characters.`,
    });
  }

  if (!BUNDLE_TYPES.includes(input.bundleType)) {
    issues.push({
      field: "bundleType",
      code: "INVALID_BUNDLE_TYPE",
      message: "Bundle type must be fixed, quantity, or mix_match.",
    });
  }

  const quantityIssue = validateRequiredQuantity(input.bundleType, input.requiredQuantity);
  if (quantityIssue) issues.push({ field: "requiredQuantity", ...quantityIssue });

  if (!DISCOUNT_TYPES.includes(input.discountType)) {
    issues.push({
      field: "discountType",
      code: "INVALID_DISCOUNT",
      message: "Discount type must be percentage or fixed_amount.",
    });
  } else {
    const discountIssue = validateDiscount(input.discountType, input.discountValue);
    if (discountIssue) issues.push({ field: "discountValue", ...discountIssue });
  }

  issues.push(...validateProducts(input.products));
  if (input.customization) issues.push(...validateCustomization(input.customization));

  return issues;
}

// ---------------------------------------------------------------------------
// Publish readiness (draft rules + what an active bundle additionally needs)
// ---------------------------------------------------------------------------

export function validateBundleForPublish(input: BundleDraftInput): ValidationIssue[] {
  const issues = validateBundleDraft(input);

  if (input.products.length === 0) {
    issues.push({
      field: "products",
      code: "INVALID_PRODUCT",
      message: "Add at least one product before publishing.",
    });
  }

  if (input.bundleType !== "fixed" && input.requiredQuantity === null) {
    issues.push({
      field: "requiredQuantity",
      code: "INVALID_QUANTITY",
      message: "Required quantity must be set for quantity and mix & match bundles.",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Lifecycle: draft -> active -> inactive -> active
// ---------------------------------------------------------------------------

export const canEdit = (status: BundleStatus): boolean => status !== "active";
export const canPublish = (status: BundleStatus): boolean =>
  status === "draft" || status === "inactive";
export const canDeactivate = (status: BundleStatus): boolean => status === "active";
