// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CartInput } from "@/extensions/bundle-discount/generated/api";
import { cartLinesDiscountsGenerateRun } from "@/extensions/bundle-discount/src/cart_lines_discounts_generate_run";
import { parseConfig } from "@/extensions/bundle-discount/src/config";
import { buildCartLines } from "@/lib/storefront/cart";
import { buildDiscountConfig, type DiscountConfigSource } from "./config";

/**
 * The server writes the configuration and the storefront writes the cart
 * properties; the Function reads both. These tests wire the real producers
 * to the real consumer so a change on either side that the other can't
 * read fails here instead of silently discounting nothing at checkout.
 */
const BUNDLE_ID = "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11";

const source = (over: Partial<DiscountConfigSource> = {}): DiscountConfigSource => ({
  id: BUNDLE_ID,
  title: "Complete Look",
  bundleType: "fixed",
  requiredQuantity: null,
  discountType: "percentage",
  discountValue: { toNumber: () => 20 },
  bundleProducts: [
    {
      shopifyProductId: "gid://shopify/Product/1001",
      shopifyVariantId: "gid://shopify/ProductVariant/2001",
      quantity: 1,
    },
    { shopifyProductId: "1002", shopifyVariantId: "2002", quantity: 2 },
  ],
  ...over,
});

/** Turns what the widget adds to the cart into the Function's input, as Shopify would. */
function cartInput(
  lines: ReturnType<typeof buildCartLines>,
  productOf: Record<number, number>,
  configuration: string,
  currency = "USD",
): CartInput {
  return {
    cart: {
      cost: { subtotalAmount: { currencyCode: currency } },
      lines: lines.map((line, index) => ({
        id: `gid://shopify/CartLine/${index + 1}`,
        quantity: line.quantity,
        bundleId: { value: line.properties._bundle_id },
        instanceId: { value: line.properties._bundle_instance_id },
        cost: { subtotalAmount: { amount: "25.00" } },
        merchandise: {
          __typename: "ProductVariant",
          id: `gid://shopify/ProductVariant/${line.id}`,
          product: { id: `gid://shopify/Product/${productOf[line.id]}` },
        },
      })),
    },
    discount: { discountClasses: ["PRODUCT"], configuration: { value: configuration } },
  } as unknown as CartInput;
}

describe("server config -> Function", () => {
  it("produces a config the Function's parser accepts, with numeric ids", () => {
    const config = buildDiscountConfig(source(), "USD");
    const parsed = parseConfig(JSON.stringify(config));
    expect(parsed).toEqual(config);
    expect(parsed?.rows).toEqual([
      { productId: "1001", variantId: "2001", quantity: 1 },
      { productId: "1002", variantId: "2002", quantity: 2 },
    ]);
  });

  it("fixed bundle: what the widget adds is exactly what the Function discounts", () => {
    const configuration = JSON.stringify(buildDiscountConfig(source(), "USD"));
    const lines = buildCartLines(
      { id: BUNDLE_ID, name: "Complete Look", type: "fixed" },
      [
        { key: "2001", variantId: "2001", quantity: 1 },
        { key: "2002", variantId: "2002", quantity: 2 },
      ],
      "instance-1",
    );
    const { operations } = cartLinesDiscountsGenerateRun(
      cartInput(lines, { 2001: 1001, 2002: 1002 }, configuration),
    );
    expect(operations).toHaveLength(1);
    expect(JSON.stringify(operations)).toContain('"percentage":{"value":"20"}');
  });

  it("quantity and mix & match bundles round-trip the same way", () => {
    for (const bundleType of ["quantity", "mix_match"] as const) {
      const config = buildDiscountConfig(
        source({
          bundleType,
          requiredQuantity: bundleType === "quantity" ? 3 : 2,
          discountType: "fixed_amount",
          discountValue: 10,
        }),
        "USD",
      );
      const lines = buildCartLines(
        { id: BUNDLE_ID, name: "Complete Look", type: bundleType },
        bundleType === "quantity"
          ? [
              { key: "2001", variantId: "2001", quantity: 1 },
              { key: "2002", variantId: "2002", quantity: 2 },
            ]
          : [
              { key: "2001", variantId: "2001", quantity: 1 },
              { key: "2002", variantId: "2002", quantity: 2 },
            ],
        "instance-2",
      );
      const { operations } = cartLinesDiscountsGenerateRun(
        cartInput(lines, { 2001: 1001, 2002: 1002 }, JSON.stringify(config)),
      );
      expect(operations, bundleType).toHaveLength(1);
    }
  });

  it("a customer-edited property can't change the discount: the value only comes from config", () => {
    const configuration = JSON.stringify(buildDiscountConfig(source(), "USD"));
    const lines = buildCartLines(
      { id: BUNDLE_ID, name: "Complete Look", type: "fixed" },
      [
        { key: "2001", variantId: "2001", quantity: 1 },
        { key: "2002", variantId: "2002", quantity: 2 },
      ],
      "instance-3",
    );
    const input = cartInput(lines, { 2001: 1001, 2002: 1002 }, configuration);
    // Name, type and any extra "discount" property a customer forges are never read.
    const tampered = JSON.parse(JSON.stringify(input));
    for (const line of tampered.cart.lines) {
      line.discount = { value: "100" };
      line.bundleType = { value: "quantity" };
    }
    const output = JSON.stringify(cartLinesDiscountsGenerateRun(tampered).operations);
    expect(output).toContain('"percentage":{"value":"20"}');
    expect(output).not.toContain("100");
  });

  it("refuses to build a config for an invalid discount, product-less bundle, or bad currency", () => {
    expect(() =>
      buildDiscountConfig(source({ discountType: "percentage", discountValue: 150 }), "USD"),
    ).toThrow(RangeError);
    expect(() => buildDiscountConfig(source({ discountValue: 0 }), "USD")).toThrow(RangeError);
    expect(() => buildDiscountConfig(source({ bundleProducts: [] }), "USD")).toThrow(RangeError);
    expect(() => buildDiscountConfig(source(), "usd")).toThrow(RangeError);
  });

  it("carries nothing but bundle rules: no shop id, tokens, or internal fields", () => {
    const json = JSON.stringify(buildDiscountConfig(source(), "USD"));
    expect(Object.keys(JSON.parse(json)).sort()).toEqual(
      [
        "bundleId",
        "currencyCode",
        "discount",
        "name",
        "requiredQuantity",
        "rows",
        "type",
        "version",
      ].sort(),
    );
  });
});
