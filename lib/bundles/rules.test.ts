// @vitest-environment node
import { DEFAULT_CUSTOMIZATION } from "@/lib/customization/defaults";
import { describe, expect, it } from "vitest";
import {
  calculateDiscountedPrice,
  canDeactivate,
  canEdit,
  canPublish,
  normalizeDraft,
  validateBundleDraft,
  validateBundleForPublish,
  validateDiscount,
} from "./rules";
import type { BundleDraftInput } from "./types";

const PRODUCT = { shopifyProductId: "1001", shopifyVariantId: "2001", quantity: 1 };

function draft(overrides: Partial<BundleDraftInput> = {}): BundleDraftInput {
  return {
    title: "Summer Outfit",
    description: null,
    bundleType: "fixed",
    templateId: null,
    requiredQuantity: null,
    discountType: "percentage",
    discountValue: 20,
    products: [PRODUCT],
    customization: null,
    ...overrides,
  };
}

const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code);

describe("validateDiscount", () => {
  it("accepts a sensible percentage and fixed amount", () => {
    expect(validateDiscount("percentage", 20)).toBeNull();
    expect(validateDiscount("percentage", 100)).toBeNull();
    expect(validateDiscount("fixed_amount", 30)).toBeNull();
    expect(validateDiscount("fixed_amount", 0.5)).toBeNull();
  });

  it("rejects percentage over 100 and at or below 0", () => {
    expect(validateDiscount("percentage", 100.01)?.message).toContain("can't exceed 100%");
    expect(validateDiscount("percentage", 150)).not.toBeNull();
    expect(validateDiscount("percentage", 0)).not.toBeNull();
    expect(validateDiscount("percentage", -5)).not.toBeNull();
  });

  it("rejects non-positive and oversized fixed amounts", () => {
    expect(validateDiscount("fixed_amount", 0)).not.toBeNull();
    expect(validateDiscount("fixed_amount", -1)).not.toBeNull();
    expect(validateDiscount("fixed_amount", 1e12)).not.toBeNull();
  });

  it("rejects NaN, Infinity, and more than two decimal places", () => {
    expect(validateDiscount("percentage", Number.NaN)).not.toBeNull();
    expect(validateDiscount("fixed_amount", Number.POSITIVE_INFINITY)).not.toBeNull();
    expect(validateDiscount("percentage", 12.345)).not.toBeNull();
  });
});

describe("calculateDiscountedPrice", () => {
  it("applies percentage and fixed discounts", () => {
    expect(calculateDiscountedPrice(150, "percentage", 20)).toBe(120);
    expect(calculateDiscountedPrice(150, "fixed_amount", 30)).toBe(120);
  });

  it("never goes below zero and rounds to cents", () => {
    expect(calculateDiscountedPrice(10, "fixed_amount", 30)).toBe(0);
    expect(calculateDiscountedPrice(9.99, "percentage", 33)).toBe(6.69);
  });

  it("refuses an invalid discount", () => {
    expect(() => calculateDiscountedPrice(100, "percentage", 150)).toThrow(RangeError);
  });
});

describe("validateBundleDraft", () => {
  it("accepts a valid bundle of each type", () => {
    expect(validateBundleDraft(draft())).toEqual([]);
    expect(validateBundleDraft(draft({ bundleType: "quantity", requiredQuantity: 3 }))).toEqual([]);
    expect(validateBundleDraft(draft({ bundleType: "mix_match", requiredQuantity: 3 }))).toEqual(
      [],
    );
  });

  it("allows an incomplete draft (no products, no required quantity yet)", () => {
    expect(validateBundleDraft(draft({ products: [], bundleType: "mix_match" }))).toEqual([]);
  });

  it("rejects a missing/blank name and an over-long name", () => {
    expect(codes(validateBundleDraft(draft({ title: "   " })))).toContain("REQUIRED");
    expect(codes(validateBundleDraft(draft({ title: "x".repeat(121) })))).toContain("TOO_LONG");
  });

  it("rejects an unknown bundle type", () => {
    // @ts-expect-error deliberately invalid to prove the rule, not just the types
    expect(codes(validateBundleDraft(draft({ bundleType: "bogo" })))).toContain(
      "INVALID_BUNDLE_TYPE",
    );
  });

  it("rejects a required quantity on a fixed bundle and a bad one on other types", () => {
    expect(codes(validateBundleDraft(draft({ requiredQuantity: 2 })))).toContain(
      "INVALID_QUANTITY",
    );
    for (const bad of [0, -1, 1.5, 101]) {
      expect(
        codes(validateBundleDraft(draft({ bundleType: "quantity", requiredQuantity: bad }))),
      ).toContain("INVALID_QUANTITY");
    }
  });

  it("rejects malformed product/variant IDs, bad quantities, and duplicates", () => {
    const issues = validateBundleDraft(
      draft({
        products: [
          { shopifyProductId: "abc", shopifyVariantId: "2001", quantity: 1 },
          { shopifyProductId: "1002", shopifyVariantId: "not-a-variant", quantity: 1 },
          { shopifyProductId: "1003", shopifyVariantId: "2003", quantity: 0 },
          { shopifyProductId: "1004", shopifyVariantId: "2003", quantity: 1 },
        ],
      }),
    );
    expect(issues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining([
        "products[0].shopifyProductId",
        "products[1].shopifyVariantId",
        "products[2].quantity",
        "products[3].shopifyVariantId",
      ]),
    );
    expect(codes(issues)).toContain("DUPLICATE_PRODUCT");
  });

  it("accepts Shopify global IDs", () => {
    expect(
      validateBundleDraft(
        draft({
          products: [
            {
              shopifyProductId: "gid://shopify/Product/1001",
              shopifyVariantId: "gid://shopify/ProductVariant/2001",
              quantity: 2,
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("rejects an invalid discount", () => {
    expect(codes(validateBundleDraft(draft({ discountValue: 150 })))).toContain("INVALID_DISCOUNT");
    expect(codes(validateBundleDraft(draft({ discountValue: 0 })))).toContain("INVALID_DISCOUNT");
  });

  it("rejects bad customization values", () => {
    const issues = validateBundleDraft(
      draft({
        customization: {
          layout: "card",
          colors: {
            ...DEFAULT_CUSTOMIZATION.colors,
            primary: "red",
            button: "#111827",
            background: "#fff",
          },
          typography: { ...DEFAULT_CUSTOMIZATION.typography, fontSize: 40 },
          card: DEFAULT_CUSTOMIZATION.card,
          button: DEFAULT_CUSTOMIZATION.button,
          spacing: DEFAULT_CUSTOMIZATION.spacing,
        },
      }),
    );
    expect(issues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining([
        "customization.colors.primary",
        "customization.colors.background",
        "customization.typography.fontSize",
      ]),
    );
  });
});

describe("validateBundleForPublish", () => {
  it("accepts a complete bundle of each type", () => {
    expect(validateBundleForPublish(draft())).toEqual([]);
    expect(
      validateBundleForPublish(draft({ bundleType: "quantity", requiredQuantity: 3 })),
    ).toEqual([]);
    expect(
      validateBundleForPublish(draft({ bundleType: "mix_match", requiredQuantity: 2 })),
    ).toEqual([]);
  });

  it("requires at least one product", () => {
    const issues = validateBundleForPublish(draft({ products: [] }));
    expect(issues).toContainEqual(expect.objectContaining({ field: "products" }));
  });

  it("requires a required quantity for quantity and mix & match bundles", () => {
    expect(
      codes(validateBundleForPublish(draft({ bundleType: "quantity", requiredQuantity: null }))),
    ).toContain("INVALID_QUANTITY");
    expect(
      codes(validateBundleForPublish(draft({ bundleType: "mix_match", requiredQuantity: null }))),
    ).toContain("INVALID_QUANTITY");
  });
});

describe("lifecycle rules", () => {
  it("only draft/inactive can publish, only active can deactivate, active can't be edited", () => {
    expect(canPublish("draft")).toBe(true);
    expect(canPublish("inactive")).toBe(true);
    expect(canPublish("active")).toBe(false);
    expect(canDeactivate("active")).toBe(true);
    expect(canDeactivate("draft")).toBe(false);
    expect(canDeactivate("inactive")).toBe(false);
    expect(canEdit("draft")).toBe(true);
    expect(canEdit("inactive")).toBe(true);
    expect(canEdit("active")).toBe(false);
  });
});

describe("normalizeDraft", () => {
  it("trims the title and turns a blank description into null", () => {
    const normalized = normalizeDraft(draft({ title: "  Look  ", description: "   " }));
    expect(normalized.title).toBe("Look");
    expect(normalized.description).toBeNull();
  });
});
