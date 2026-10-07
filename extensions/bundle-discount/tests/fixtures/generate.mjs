// Regenerates the JSON fixtures next to this file: `node tests/fixtures/generate.mjs`.
// Kept as code so the cart shapes stay readable and consistent; the JSON is what the tests run.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const BUNDLE = "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11";
const TARGET = "cart.lines.discounts.generate.run";

const config = (over = {}) =>
  JSON.stringify({
    version: 1,
    bundleId: BUNDLE,
    name: "Complete Look",
    type: "fixed",
    requiredQuantity: null,
    discount: { type: "percentage", value: 20 },
    currencyCode: "USD",
    rows: [
      { productId: "1001", variantId: "2001", quantity: 1 },
      { productId: "1002", variantId: "2002", quantity: 2 },
    ],
    ...over,
  });

const line = (n, variant, product, quantity, amount, { bundle = BUNDLE, instance = "inst-1" } = {}) => ({
  id: `gid://shopify/CartLine/${n}`,
  quantity,
  bundleId: bundle === null ? null : { value: bundle },
  instanceId: instance === null ? null : { value: instance },
  cost: { subtotalAmount: { amount } },
  merchandise: {
    __typename: "ProductVariant",
    id: `gid://shopify/ProductVariant/${variant}`,
    product: { id: `gid://shopify/Product/${product}` },
  },
});

const input = (lines, cfg = config(), { currency = "USD", classes = ["PRODUCT"] } = {}) => ({
  cart: { cost: { subtotalAmount: { currencyCode: currency } }, lines },
  discount: { discountClasses: classes, configuration: cfg === null ? null : { value: cfg } },
});

const candidate = (ids, value) => ({
  message: "Bundle: Complete Look",
  targets: ids.map((n) => ({ cartLine: { id: `gid://shopify/CartLine/${n}` } })),
  value,
});
const add = (...candidates) => ({
  operations: [{ productDiscountsAdd: { candidates, selectionStrategy: "ALL" } }],
});
const NONE = { operations: [] };
const complete = [line(1, 2001, 1001, 1, "50.00"), line(2, 2002, 1002, 2, "50.00")];

const fixtures = {
  "percentage-complete-fixed-bundle": [
    input(complete),
    add(candidate([1, 2], { percentage: { value: "20" } })),
  ],
  "fixed-amount-complete-fixed-bundle": [
    input(complete, config({ discount: { type: "fixed_amount", value: 15 } })),
    add(candidate([1, 2], { fixedAmount: { amount: "15.00", appliesToEachItem: false } })),
  ],
  "fixed-amount-capped-at-bundle-subtotal": [
    input(complete, config({ discount: { type: "fixed_amount", value: 500 } })),
    add(candidate([1, 2], { fixedAmount: { amount: "100.00", appliesToEachItem: false } })),
  ],
  "fixed-amount-skipped-in-other-currency": [
    input(complete, config({ discount: { type: "fixed_amount", value: 15 } }), { currency: "EUR" }),
    NONE,
  ],
  "quantity-bundle-exact-count-across-products": [
    input(
      [line(1, 2001, 1001, 2, "40.00"), line(2, 2002, 1002, 1, "20.00")],
      config({ type: "quantity", requiredQuantity: 3 }),
    ),
    add(candidate([1, 2], { percentage: { value: "20" } })),
  ],
  "quantity-bundle-incomplete": [
    input(
      [line(1, 2001, 1001, 2, "40.00")],
      config({ type: "quantity", requiredQuantity: 3 }),
    ),
    NONE,
  ],
  "mix-match-bundle-complete": [
    input(
      [line(1, 2001, 1001, 1, "20.00"), line(2, 2002, 1002, 2, "40.00")],
      config({ type: "mix_match", requiredQuantity: 2 }),
    ),
    add(candidate([1, 2], { percentage: { value: "20" } })),
  ],
  "missing-product-gets-no-discount": [input([line(1, 2001, 1001, 1, "50.00")]), NONE],
  "wrong-quantity-gets-no-discount": [
    input([line(1, 2001, 1001, 1, "50.00"), line(2, 2002, 1002, 1, "25.00")]),
    NONE,
  ],
  "product-outside-the-bundle-gets-no-discount": [
    input([...complete, line(3, 2999, 1999, 1, "10.00")]),
    NONE,
  ],
  "tampered-bundle-id-gets-no-discount": [
    input([
      line(1, 2001, 1001, 1, "50.00", { bundle: "another-bundle" }),
      line(2, 2002, 1002, 2, "50.00", { bundle: "another-bundle" }),
    ]),
    NONE,
  ],
  "missing-instance-id-gets-no-discount": [
    input([line(1, 2001, 1001, 1, "50.00", { instance: null }), line(2, 2002, 1002, 2, "50.00", { instance: null })]),
    NONE,
  ],
  "no-bundle-properties-gets-no-discount": [
    input([
      line(1, 2001, 1001, 1, "50.00", { bundle: null, instance: null }),
      line(2, 2002, 1002, 2, "50.00", { bundle: null, instance: null }),
    ]),
    NONE,
  ],
  "missing-configuration-gets-no-discount": [input(complete, null), NONE],
  "corrupt-configuration-gets-no-discount": [input(complete, "{not json"), NONE],
  "other-discount-class-gets-no-discount": [
    input(complete, config(), { classes: ["ORDER"] }),
    NONE,
  ],
  "two-complete-instances-are-each-discounted": [
    input([
      line(1, 2001, 1001, 1, "50.00", { instance: "inst-a" }),
      line(2, 2002, 1002, 2, "50.00", { instance: "inst-a" }),
      line(3, 2001, 1001, 1, "50.00", { instance: "inst-b" }),
      line(4, 2002, 1002, 2, "50.00", { instance: "inst-b" }),
    ]),
    add(
      candidate([1, 2], { percentage: { value: "20" } }),
      candidate([3, 4], { percentage: { value: "20" } }),
    ),
  ],
  "only-the-complete-instance-is-discounted": [
    input([
      line(1, 2001, 1001, 1, "50.00", { instance: "inst-a" }),
      line(2, 2002, 1002, 2, "50.00", { instance: "inst-a" }),
      line(3, 2001, 1001, 1, "50.00", { instance: "inst-b" }),
    ]),
    add(candidate([1, 2], { percentage: { value: "20" } })),
  ],
};

for (const [name, [inputValue, output]] of Object.entries(fixtures)) {
  const fixture = {
    name,
    payload: { export: "cart-lines-discounts-generate-run", target: TARGET, input: inputValue, output },
  };
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(fixture, null, 2) + "\n");
}
console.log(`wrote ${Object.keys(fixtures).length} fixtures`);
