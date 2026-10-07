// @vitest-environment node
import { DEFAULT_CUSTOMIZATION } from "@/lib/customization/defaults";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { buildCartLines } from "./cart";
import { computeTotals } from "./pricing";
import { resolveSelection, toSelectionBundle, type SelectionBundle } from "./selection";
import { toNumericId, type StorefrontBundle } from "./types";
import { parseCartRequest, parseStorefrontQuery } from "./validation";

const rows = [
  { key: "101", quantity: 1, allowedVariantIds: ["101", "102"] },
  { key: "201", quantity: 2, allowedVariantIds: ["201"] },
  { key: "301", quantity: 1, allowedVariantIds: ["301"] },
];
const bundle = (over: Partial<SelectionBundle>): SelectionBundle => ({
  type: "fixed",
  requiredQuantity: null,
  rows,
  ...over,
});
const item = (key: string, variantId = key, quantity = 1) => ({ key, variantId, quantity });

describe("fixed bundle selection", () => {
  it("accepts every product once, taking quantities from the bundle, not the customer", () => {
    const result = resolveSelection(bundle({}), [
      item("101", "102", 9),
      item("201", "201", 9),
      item("301"),
    ]);
    expect(result).toEqual({
      ok: true,
      lines: [
        { key: "101", variantId: "102", quantity: 1 },
        { key: "201", variantId: "201", quantity: 2 },
        { key: "301", variantId: "301", quantity: 1 },
      ],
    });
  });

  it("blocks a partial selection", () => {
    const result = resolveSelection(bundle({}), [item("101"), item("201")]);
    expect(result).toMatchObject({ ok: false, issue: { code: "SELECTION_INCOMPLETE" } });
  });
});

describe("quantity bundle selection", () => {
  const quantity = bundle({ type: "quantity", requiredQuantity: 3 });

  it("accepts exactly the required number of units, across products", () => {
    const result = resolveSelection(quantity, [item("101", "101", 2), item("301", "301", 1)]);
    expect(result.ok).toBe(true);
  });

  it("blocks under-selection with a friendly count and over-selection", () => {
    expect(resolveSelection(quantity, [item("101", "101", 1)])).toMatchObject({
      ok: false,
      issue: { code: "SELECTION_INCOMPLETE", message: "Choose 2 more items." },
    });
    expect(
      resolveSelection(quantity, [item("101", "101", 2), item("301", "301", 2)]),
    ).toMatchObject({
      ok: false,
      issue: { code: "SELECTION_TOO_MANY" },
    });
  });

  it("blocks an empty selection", () => {
    expect(resolveSelection(quantity, [])).toMatchObject({
      ok: false,
      issue: { code: "SELECTION_INCOMPLETE" },
    });
  });
});

describe("mix & match selection", () => {
  const mix = bundle({ type: "mix_match", requiredQuantity: 2 });

  it("accepts exactly N distinct products", () => {
    expect(resolveSelection(mix, [item("101"), item("301")]).ok).toBe(true);
  });

  it("enforces the required count in both directions", () => {
    expect(resolveSelection(mix, [item("101")])).toMatchObject({
      ok: false,
      issue: { code: "SELECTION_INCOMPLETE" },
    });
    expect(resolveSelection(mix, [item("101"), item("201", "201", 2), item("301")])).toMatchObject({
      ok: false,
      issue: { code: "SELECTION_TOO_MANY" },
    });
  });

  it("blocks duplicate picks of the same product", () => {
    expect(resolveSelection(mix, [item("101"), item("101")])).toMatchObject({
      ok: false,
      issue: { code: "INVALID_SELECTION" },
    });
  });

  it("blocks a quantity the bundle didn't define for that product", () => {
    expect(resolveSelection(mix, [item("101", "101", 5), item("301")])).toMatchObject({
      ok: false,
      issue: { code: "INVALID_QUANTITY" },
    });
  });
});

describe("invalid input is rejected for every type", () => {
  it("unknown product keys, unavailable variants, bad quantities", () => {
    for (const type of ["fixed", "quantity", "mix_match"] as const) {
      const b = bundle({ type, requiredQuantity: type === "fixed" ? null : 1 });
      expect(resolveSelection(b, [item("999")])).toMatchObject({
        ok: false,
        issue: { code: "INVALID_SELECTION" },
      });
      expect(resolveSelection(b, [item("101", "555")])).toMatchObject({
        ok: false,
        issue: { code: "INVALID_VARIANT" },
      });
      for (const quantity of [0, -1, 1.5, 101]) {
        expect(resolveSelection(b, [item("101", "101", quantity)])).toMatchObject({
          ok: false,
          issue: { code: "INVALID_QUANTITY" },
        });
      }
    }
  });

  it("a bundle with no products is unavailable", () => {
    expect(resolveSelection(bundle({ rows: [] }), [])).toMatchObject({
      ok: false,
      issue: { code: "BUNDLE_UNAVAILABLE" },
    });
  });

  it("a non-fixed bundle without a required quantity is unavailable", () => {
    expect(
      resolveSelection(bundle({ type: "quantity", requiredQuantity: null }), [item("101")]),
    ).toMatchObject({
      ok: false,
      issue: { code: "BUNDLE_UNAVAILABLE" },
    });
  });
});

describe("toSelectionBundle variant rules", () => {
  const storefront: StorefrontBundle = {
    id: "b",
    name: "B",
    description: null,
    type: "fixed",
    requiredQuantity: null,
    discount: { type: "percentage", value: 10 },
    customization: {
      layout: "card",
      colors: {
        ...DEFAULT_CUSTOMIZATION.colors,
        primary: "#000000",
        button: "#000000",
        background: "#ffffff",
      },
      typography: { ...DEFAULT_CUSTOMIZATION.typography, fontSize: 16 },
      card: DEFAULT_CUSTOMIZATION.card,
      button: DEFAULT_CUSTOMIZATION.button,
      spacing: DEFAULT_CUSTOMIZATION.spacing,
    },
    productCount: 1,
    products: [
      {
        key: "11",
        productId: "1",
        variantId: "11",
        quantity: 1,
        title: "T",
        imageUrl: null,
        variants: [
          { id: "11", title: "S", price: "10.00", available: true },
          { id: "12", title: "M", price: "10.00", available: true },
          { id: "13", title: "L", price: "10.00", available: false },
        ],
      },
    ],
  };

  it("allows the configured variant plus in-stock siblings, never sold-out or unverified ones", () => {
    expect(toSelectionBundle(storefront).rows[0].allowedVariantIds).toEqual(["11", "12"]);
  });

  it("with no live data, only the configured variant is allowed", () => {
    const noLiveData = { ...storefront, products: [{ ...storefront.products[0], variants: [] }] };
    expect(toSelectionBundle(noLiveData).rows[0].allowedVariantIds).toEqual(["11"]);
  });
});

describe("buildCartLines", () => {
  it("adds hidden bundle identification properties and nothing about the merchant", () => {
    const [line] = buildCartLines(
      { id: "bundle-1", name: "Look", type: "mix_match" },
      [{ key: "11", variantId: "11", quantity: 2 }],
      "instance-1",
    );
    expect(line).toEqual({
      id: 11,
      quantity: 2,
      properties: {
        _bundle_id: "bundle-1",
        _bundle_name: "Look",
        _bundle_type: "mix_match",
        _bundle_instance_id: "instance-1",
      },
    });
  });

  it("refuses a malformed variant id", () => {
    expect(() =>
      buildCartLines(
        { id: "b", name: "n", type: "fixed" },
        [{ key: "x", variantId: "abc", quantity: 1 }],
        "i",
      ),
    ).toThrow(RangeError);
  });
});

describe("computeTotals (display only)", () => {
  it("uses the bundle engine's discount math", () => {
    expect(
      computeTotals(
        [
          { price: "100.00", quantity: 1 },
          { price: "25.00", quantity: 2 },
        ],
        { type: "percentage", value: 20 },
      ),
    ).toEqual({ subtotal: 150, total: 120, savings: 30 });
    expect(
      computeTotals([{ price: "150.00", quantity: 1 }], { type: "fixed_amount", value: 30 }),
    ).toEqual({
      subtotal: 150,
      total: 120,
      savings: 30,
    });
  });

  it("shows no figure rather than a guess when a price is unknown or the discount is invalid", () => {
    expect(
      computeTotals([{ price: null, quantity: 1 }], { type: "percentage", value: 10 }),
    ).toBeNull();
    expect(
      computeTotals([{ price: "10.00", quantity: 1 }], { type: "percentage", value: 500 }),
    ).toBeNull();
    expect(computeTotals([], { type: "percentage", value: 10 })).toBeNull();
  });
});

describe("toNumericId", () => {
  it("normalizes GraphQL ids and leaves numeric ids alone", () => {
    expect(toNumericId("gid://shopify/ProductVariant/4412")).toBe("4412");
    expect(toNumericId("4412")).toBe("4412");
  });
});

describe("storefront request validation", () => {
  const uuid = "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11";

  it("accepts a valid query and ignores Shopify's proxy params", () => {
    const params = new URLSearchParams({
      shop: "a.myshopify.com",
      signature: "x",
      timestamp: "1",
      productId: "123",
    });
    expect(parseStorefrontQuery(params)).toEqual({ productId: "123" });
  });

  it("rejects a malformed bundle id or product id with a 400", () => {
    const badQueries: Record<string, string>[] = [
      { bundleId: "nope" },
      { productId: "12abc" },
      { productId: "1".repeat(30) },
    ];
    for (const bad of badQueries) {
      const error = (() => {
        try {
          parseStorefrontQuery(new URLSearchParams(bad));
        } catch (e) {
          return e;
        }
      })();
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(400);
    }
  });

  it("validates the cart body strictly, rejecting unknown fields and oversized selections", () => {
    expect(
      parseCartRequest({ bundleId: uuid, selection: [{ key: "1", variantId: "1", quantity: 1 }] }),
    ).toBeTruthy();
    expect(() => parseCartRequest({ bundleId: uuid, selection: [], shopId: "other" })).toThrow(
      ApiError,
    );
    expect(() =>
      parseCartRequest({ bundleId: uuid, selection: [{ key: "x", variantId: "1", quantity: 1 }] }),
    ).toThrow(ApiError);
    expect(() =>
      parseCartRequest({
        bundleId: uuid,
        selection: Array.from({ length: 61 }, () => ({ key: "1", variantId: "1", quantity: 1 })),
      }),
    ).toThrow(ApiError);
  });
});
