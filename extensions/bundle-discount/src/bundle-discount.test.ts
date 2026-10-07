// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CartInput } from "../generated/api";
import { groupBundleInstances, type InputLine } from "./bundle";
import { cartLinesDiscountsGenerateRun } from "./cart_lines_discounts_generate_run";
import { parseConfig, type BundleConfig } from "./config";
import { buildCandidate } from "./discount";
import { validateInstance } from "./validation";

const BUNDLE = "bundle-1";

const baseConfig = (over: Partial<BundleConfig> = {}): BundleConfig => ({
  version: 1,
  bundleId: BUNDLE,
  name: "Look",
  type: "fixed",
  requiredQuantity: null,
  discount: { type: "percentage", value: 20 },
  currencyCode: "USD",
  rows: [
    { productId: "1", variantId: "11", quantity: 1 },
    { productId: "2", variantId: "21", quantity: 2 },
  ],
  ...over,
});

const line = (
  id: number,
  variant: number,
  product: number,
  quantity: number,
  amount = "10.00",
  props: { bundle?: string | null; instance?: string | null } = {},
): InputLine => ({
  id: `gid://shopify/CartLine/${id}`,
  quantity,
  bundleId: props.bundle === null ? null : { value: props.bundle ?? BUNDLE },
  instanceId: props.instance === null ? null : { value: props.instance ?? "i1" },
  cost: { subtotalAmount: { amount } },
  merchandise: {
    __typename: "ProductVariant",
    id: `gid://shopify/ProductVariant/${variant}`,
    product: { id: `gid://shopify/Product/${product}` },
  },
});

const instanceOf = (lines: InputLine[]) => groupBundleInstances(lines, BUNDLE)[0];
const check = (config: BundleConfig, lines: InputLine[]) =>
  validateInstance(config, instanceOf(lines));

const run = (
  lines: InputLine[],
  config: BundleConfig | string | null = baseConfig(),
  extra: { currency?: string; classes?: string[] } = {},
) =>
  cartLinesDiscountsGenerateRun({
    cart: { cost: { subtotalAmount: { currencyCode: extra.currency ?? "USD" } }, lines },
    discount: {
      discountClasses: extra.classes ?? ["PRODUCT"],
      configuration:
        config === null
          ? null
          : { value: typeof config === "string" ? config : JSON.stringify(config) },
    },
  } as unknown as CartInput);

describe("parseConfig", () => {
  it("accepts a valid config of each type", () => {
    expect(parseConfig(JSON.stringify(baseConfig()))).toEqual(baseConfig());
    expect(
      parseConfig(JSON.stringify(baseConfig({ type: "quantity", requiredQuantity: 3 })))?.type,
    ).toBe("quantity");
    expect(
      parseConfig(JSON.stringify(baseConfig({ type: "mix_match", requiredQuantity: 2 })))
        ?.requiredQuantity,
    ).toBe(2);
  });

  it("rejects anything missing, corrupt, or out of range instead of guessing", () => {
    const bad: unknown[] = [
      null,
      "",
      "{not json",
      "[]",
      { ...baseConfig(), version: 2 },
      { ...baseConfig(), type: "bogus" },
      { ...baseConfig(), discount: { type: "percentage", value: 0 } },
      { ...baseConfig(), discount: { type: "percentage", value: 101 } },
      { ...baseConfig(), discount: { type: "fixed_amount", value: -1 } },
      { ...baseConfig(), discount: { type: "free", value: 5 } },
      { ...baseConfig(), currencyCode: "usd" },
      { ...baseConfig(), rows: [] },
      { ...baseConfig(), rows: [{ productId: "x", variantId: "1", quantity: 1 }] },
      { ...baseConfig(), rows: [{ productId: "1", variantId: "1", quantity: 0 }] },
      { ...baseConfig(), type: "quantity", requiredQuantity: null },
      { ...baseConfig(), requiredQuantity: 2 },
    ];
    for (const value of bad) {
      const raw = typeof value === "string" || value === null ? value : JSON.stringify(value);
      expect(parseConfig(raw as string | null), JSON.stringify(value)).toBeNull();
    }
  });
});

describe("fixed bundle", () => {
  const complete = [line(1, 11, 1, 1), line(2, 21, 2, 2)];

  it("is valid only when every product is present at the bundle's quantity", () => {
    expect(check(baseConfig(), complete)).toEqual({ ok: true });
  });

  it("is incomplete when a product is missing", () => {
    expect(check(baseConfig(), [line(1, 11, 1, 1)])).toEqual({ ok: false, reason: "INCOMPLETE" });
  });

  it("rejects a wrong quantity", () => {
    expect(check(baseConfig(), [line(1, 11, 1, 1), line(2, 21, 2, 1)])).toEqual({
      ok: false,
      reason: "WRONG_QUANTITY",
    });
    expect(check(baseConfig(), [line(1, 11, 1, 3), line(2, 21, 2, 2)])).toEqual({
      ok: false,
      reason: "WRONG_QUANTITY",
    });
  });

  it("rejects a product that isn't in the bundle", () => {
    expect(check(baseConfig(), [...complete, line(3, 99, 9, 1)])).toEqual({
      ok: false,
      reason: "UNKNOWN_PRODUCT",
    });
  });

  it("accepts another variant of a bundle product (the widget allows that)", () => {
    expect(check(baseConfig(), [line(1, 12, 1, 1), line(2, 21, 2, 2)])).toEqual({ ok: true });
  });

  it("does not let two variants of one product stand in for two different products", () => {
    expect(check(baseConfig(), [line(1, 11, 1, 1), line(2, 12, 1, 2)])).toMatchObject({
      ok: false,
    });
  });
});

describe("quantity bundle", () => {
  const config = baseConfig({ type: "quantity", requiredQuantity: 3 });

  it("needs exactly the required number of units, spread across bundle products", () => {
    expect(check(config, [line(1, 11, 1, 2), line(2, 21, 2, 1)])).toEqual({ ok: true });
    expect(check(config, [line(1, 11, 1, 3)])).toEqual({ ok: true });
  });

  it("rejects too few and too many units", () => {
    expect(check(config, [line(1, 11, 1, 2)])).toEqual({ ok: false, reason: "INCOMPLETE" });
    expect(check(config, [line(1, 11, 1, 2), line(2, 21, 2, 2)])).toEqual({
      ok: false,
      reason: "TOO_MANY",
    });
  });
});

describe("mix & match bundle", () => {
  const config = baseConfig({ type: "mix_match", requiredQuantity: 2 });

  it("needs exactly N distinct products at their own quantities", () => {
    expect(check(config, [line(1, 11, 1, 1), line(2, 21, 2, 2)])).toEqual({ ok: true });
  });

  it("rejects too few or too many products, and wrong quantities", () => {
    expect(check(config, [line(1, 11, 1, 1)])).toEqual({ ok: false, reason: "INCOMPLETE" });
    const three = baseConfig({
      type: "mix_match",
      requiredQuantity: 1,
    });
    expect(check(three, [line(1, 11, 1, 1), line(2, 21, 2, 2)])).toEqual({
      ok: false,
      reason: "TOO_MANY",
    });
    expect(check(config, [line(1, 11, 1, 5), line(2, 21, 2, 2)])).toEqual({
      ok: false,
      reason: "WRONG_QUANTITY",
    });
  });
});

describe("bundle detection from line properties", () => {
  it("ignores lines with no bundle or no instance id", () => {
    expect(groupBundleInstances([line(1, 11, 1, 1, "1", { bundle: null })], BUNDLE)).toEqual([]);
    expect(groupBundleInstances([line(1, 11, 1, 1, "1", { instance: null })], BUNDLE)).toEqual([]);
  });

  it("separates instances by their instance id", () => {
    const groups = groupBundleInstances(
      [line(1, 11, 1, 1, "1", { instance: "a" }), line(2, 11, 1, 1, "1", { instance: "b" })],
      BUNDLE,
    );
    expect(groups.map((g) => g.instanceId)).toEqual(["a", "b"]);
  });

  it("drops a whole group that mixes in a line claiming another bundle", () => {
    expect(
      groupBundleInstances(
        [line(1, 11, 1, 1), line(2, 21, 2, 2, "1", { bundle: "someone-else" })],
        BUNDLE,
      ),
    ).toEqual([]);
  });

  it("never groups custom (non-variant) merchandise", () => {
    const custom = { ...line(1, 11, 1, 1), merchandise: { __typename: "CustomProduct" } };
    expect(groupBundleInstances([custom], BUNDLE)).toEqual([]);
  });
});

describe("buildCandidate", () => {
  const instance = instanceOf([line(1, 11, 1, 1, "60.00"), line(2, 21, 2, 2, "40.00")]);

  it("percentage: every line of the instance, value from config as a decimal string", () => {
    expect(buildCandidate(baseConfig(), instance, "USD")).toEqual({
      message: "Bundle: Look",
      targets: [
        { cartLine: { id: "gid://shopify/CartLine/1" } },
        { cartLine: { id: "gid://shopify/CartLine/2" } },
      ],
      value: { percentage: { value: "20" } },
    });
  });

  it("fixed amount: spread once across the instance", () => {
    const config = baseConfig({ discount: { type: "fixed_amount", value: 15.5 } });
    expect(buildCandidate(config, instance, "USD")?.value).toEqual({
      fixedAmount: { amount: "15.50", appliesToEachItem: false },
    });
  });

  it("fixed amount: never exceeds the bundle subtotal", () => {
    const config = baseConfig({ discount: { type: "fixed_amount", value: 500 } });
    expect(buildCandidate(config, instance, "USD")?.value).toEqual({
      fixedAmount: { amount: "100.00", appliesToEachItem: false },
    });
  });

  it("fixed amount: skipped when the cart isn't in the currency it was set in", () => {
    const config = baseConfig({ discount: { type: "fixed_amount", value: 10 } });
    expect(buildCandidate(config, instance, "EUR")).toBeNull();
  });
});

describe("cartLinesDiscountsGenerateRun", () => {
  const complete = [line(1, 11, 1, 1, "50.00"), line(2, 21, 2, 2, "50.00")];

  it("discounts a complete bundle", () => {
    const { operations } = run(complete);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      productDiscountsAdd: { selectionStrategy: "ALL", candidates: [{ targets: [{}, {}] }] },
    });
  });

  it("returns no operations rather than failing for bad or missing configuration", () => {
    expect(run(complete, null).operations).toEqual([]);
    expect(run(complete, "{oops").operations).toEqual([]);
    expect(run(complete, { ...baseConfig(), discount: { type: "percentage", value: 500 } }).operations).toEqual([]);
  });

  it("does nothing when the discount doesn't have the product class or the cart is empty", () => {
    expect(run(complete, baseConfig(), { classes: ["ORDER"] }).operations).toEqual([]);
    expect(run([]).operations).toEqual([]);
  });

  it("does nothing for an incomplete bundle or a bundle claimed under a different id", () => {
    expect(run([line(1, 11, 1, 1)]).operations).toEqual([]);
    expect(
      run([
        line(1, 11, 1, 1, "1", { bundle: "other" }),
        line(2, 21, 2, 2, "1", { bundle: "other" }),
      ]).operations,
    ).toEqual([]);
  });

  it("discounts each complete instance independently, and only the complete ones", () => {
    const twoComplete = [
      ...complete.map((l) => ({ ...l, instanceId: { value: "a" } })),
      line(3, 11, 1, 1, "50.00", { instance: "b" }),
      line(4, 21, 2, 2, "50.00", { instance: "b" }),
    ];
    const candidates = (run(twoComplete).operations[0] as { productDiscountsAdd: { candidates: unknown[] } })
      .productDiscountsAdd.candidates;
    expect(candidates).toHaveLength(2);

    const oneIncomplete = [
      ...complete.map((l) => ({ ...l, instanceId: { value: "a" } })),
      line(3, 11, 1, 1, "50.00", { instance: "b" }),
    ];
    const only = (run(oneIncomplete).operations[0] as { productDiscountsAdd: { candidates: unknown[] } })
      .productDiscountsAdd.candidates;
    expect(only).toHaveLength(1);
  });

  it("two different bundles in one cart are each discounted by their own Function run", () => {
    const other = baseConfig({
      bundleId: "bundle-2",
      discount: { type: "percentage", value: 10 },
      rows: [{ productId: "7", variantId: "71", quantity: 1 }],
    });
    const cart = [
      ...complete,
      line(5, 71, 7, 1, "30.00", { bundle: "bundle-2", instance: "z" }),
    ];
    const first = run(cart, baseConfig());
    const second = run(cart, other);
    const targets = (r: typeof first) =>
      (r.operations[0] as { productDiscountsAdd: { candidates: { targets: unknown[] }[] } })
        .productDiscountsAdd.candidates.flatMap((c) => c.targets);
    expect(targets(first)).toHaveLength(2); // its own lines only
    expect(targets(second)).toHaveLength(1);
  });
});
