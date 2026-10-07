# Bundle Engine Architecture

## Purpose

Core business logic responsible for creating and managing bundles.

---

# Supported Bundle Types

## Fixed Bundle

Example:

Shirt + Jeans + Shoes

Bundle price:

$99

Logic:

Products are fixed.

Customer buys complete bundle.

---

# Quantity Bundle

Example:

Buy 3 T-Shirts

Get 15% discount

Logic:

Customer selects quantity.

---

# Mix & Match Bundle

Example:

Choose any 3 products

Get 20% discount

Logic:

Customer has product selection freedom.

---

# Bundle Creation Flow

Merchant creates bundle

↓

Select bundle type

↓

Select products

↓

Configure discount

↓

Customize appearance

↓

Publish

---

# Bundle Validation

Before publishing:

Check:

✓ Products exist

✓ Variants available

✓ Discount valid

✓ Bundle has products

---

# Discount Calculation

Input:

Products price

-

Discount rules

Output:

Final bundle price

---

# Business Rules

Bundle must belong to one Shopify store.

One store cannot access another store bundles.

---

# Future Expansion

Support:

- BOGO
- Subscription bundles
- Gift bundles
- Volume discounts


---

# Catalog validation (ACTION-012)

- Saving through the API requires every product and variant to exist in the shop's synced catalog (numeric
  or gid ids accepted; the variant must belong to the named product). Direct service calls (duplicate)
  skip this, since they copy an already validated bundle.
- Publishing requires every product to be `active` and every variant not removed. A sold-out variant is
  allowed (stock is temporary and the storefront shows it as sold out).
- A product disappearing from Shopify never changes or deletes a bundle: `GET /api/bundles/:id` reports each
  product's availability, and the bundle list shows "N products need attention". Re-publishing is blocked
  until the merchant fixes it.


---

# Landing page rules (ACTION-013)

The landing page introduces no bundle type or discount rule. Fixed, quantity and mix & match are shown as they
are; the price on a fixed card is `computeTotals` (the engine's `calculateDiscountedPrice`) over the configured
variants and quantities, and is `null` when any price is unknown. Selection validation, cart lines and the
checkout discount are unchanged and still enforced server-side (`prepareBundleCart`, the Discount Function).


---

# Templates (ACTION-014)

A template is a starting configuration, not a bundle type: it maps to `fixed`, `quantity` or `mix_match` and
adds no rules. The five MVP templates:

| Template            | Category | Type      | Quantity | Discount | Layout     |
| ------------------- | -------- | --------- | -------- | -------- | ---------- |
| Complete Look       | Fashion  | fixed     | -        | 15%      | card       |
| Weekend Outfit      | Fashion  | fixed     | -        | 10%      | horizontal |
| Seasonal Collection | Fashion  | mix_match | 3        | 20%      | vertical   |
| Skincare Routine    | Beauty   | fixed     | -        | 15%      | card       |
| Hair Care Kit       | Beauty   | fixed     | -        | 20%      | card       |

Each also suggests about four product roles (for example Top, Bottom, Shoes, Accessory). These are guidance
only: nothing classifies or restricts the merchant's products.

**Flow.** The wizard loads the templates, the merchant previews one and chooses "Use this template", which
fills in the type, quantity, discount and design (the merchant's name and products are never touched). The
merchant edits freely, and the wizard submits ordinary bundle fields plus `templateId`. The server validates
the whole draft (`validateBundleDraft`, catalog check, plan limits, publish rules) and checks only that the
template exists and is still offered. It never trusts or reads template defaults from the request, and a
template's own defaults are checked with the same `validateBundleDraft` before they are ever shown.

**Existing bundles.** A bundle with no template, or one whose template was retired or deleted, stays
readable, editable and publishable; nothing is rewritten. Changing to a different template requires it to be
active; keeping the current one does not.

The catalog lives in `lib/templates/catalog.ts` and is written by `services/templates/seed.ts` (`npx prisma
db seed`): rows are matched by slug, so repeated runs neither duplicate nor change ids, and a catalog row is
restored to the code's version and re-activated.


---

# Customization in the bundle engine (ACTION-015)

Customization is presentation only: it does not touch types, products, discounts or the cart. Rules live in
`lib/customization` (one field table, `spec.ts`, read by the strict validator and the lenient sanitiser) and the
bundle draft rules call `validateCustomization`, so a bundle cannot be saved with an invalid design and the wizard,
APIs and templates all share the same rules.

Precedence: template default design (copied when the template is applied) -> merchant edits -> the bundle's saved
customization -> storefront. The bundle never depends on the template after creation. Defaults for a bundle with
no customization come from `DEFAULT_CUSTOMIZATION`, the only place defaults are defined.
