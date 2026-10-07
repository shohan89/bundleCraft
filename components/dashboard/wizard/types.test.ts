import { describe, expect, it } from "vitest";
import {
  INITIAL_WIZARD_STATE,
  bundleToWizardState,
  validateDiscountValue,
  wizardStateToPayload,
} from "./types";

describe("validateDiscountValue", () => {
  it("rejects empty input", () => {
    expect(validateDiscountValue("percentage", "")).not.toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(validateDiscountValue("percentage", "abc")).not.toBeNull();
  });

  it("rejects zero or negative values", () => {
    expect(validateDiscountValue("percentage", "0")).not.toBeNull();
    expect(validateDiscountValue("fixed_amount", "-5")).not.toBeNull();
  });

  it("rejects a percentage over 100", () => {
    expect(validateDiscountValue("percentage", "150")).not.toBeNull();
  });

  it("accepts a valid percentage", () => {
    expect(validateDiscountValue("percentage", "20")).toBeNull();
  });

  it("accepts a fixed amount over 100 (no upper bound for fixed_amount)", () => {
    expect(validateDiscountValue("fixed_amount", "150")).toBeNull();
  });

  it("accepts a valid fixed amount", () => {
    expect(validateDiscountValue("fixed_amount", "30")).toBeNull();
  });
});

describe("products in the wizard payload", () => {
  const product = {
    shopifyProductId: "1001",
    shopifyVariantId: "2001",
    quantity: 2,
    title: "Linen Shirt",
    variantTitle: "M",
    imageUrl: "https://cdn.shopify.com/x.png",
    price: "45.00",
    availability: "available" as const,
  };

  it("sends only ids and quantities, never display data", () => {
    const payload = wizardStateToPayload({ ...INITIAL_WIZARD_STATE, products: [product] }, null);
    expect(payload.products).toEqual([
      { shopifyProductId: "1001", shopifyVariantId: "2001", quantity: 2 },
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/Linen|cdn\.shopify|45\.00/);
  });

  it("starts an edit from the bundle's products, with names and availability from the catalog", () => {
    const state = bundleToWizardState({
      id: "b1",
      title: "T",
      description: null,
      bundleType: "fixed",
      templateId: null,
      requiredQuantity: null,
      discountType: "percentage",
      discountValue: 10,
      status: "draft",
      customization: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      products: [
        {
          id: "bp1",
          position: 0,
          shopifyProductId: "1",
          shopifyVariantId: "11",
          quantity: 1,
          catalog: {
            availability: "unavailable",
            productTitle: "Old Tee",
            variantTitle: "S",
            imageUrl: null,
            price: "9.00",
          },
        },
        { id: "bp2", position: 1, shopifyProductId: "2", shopifyVariantId: "22", quantity: 3 },
      ],
    });
    expect(state.products).toEqual([
      expect.objectContaining({ title: "Old Tee", variantTitle: "S", availability: "unavailable" }),
      expect.objectContaining({
        title: "Product no longer in your catalog",
        availability: "unknown",
        quantity: 3,
      }),
    ]);
  });
});
