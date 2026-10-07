# Shopify Extensions

## bundle-widget (Theme App Extension)

Customer-facing storefront widget (ACTION-006). Generated with `shopify app generate extension`
and validated with `shopify app build` (runs Shopify's theme-check).

```
extensions/bundle-widget/
  shopify.extension.toml        type = "theme"
  blocks/bundle-widget.liquid   product page block ("BundleCraft bundle")
  blocks/bundle-listing.liquid  landing page block ("BundleCraft bundle list")
  snippets/bundlecraft-root.liquid  shared mount point + public data-* attributes
  assets/bundlecraft-widget.js  BUILT — do not edit by hand
  assets/bundlecraft-widget.css hand-written, every selector scoped under .bc-
  locales/en.default.json       widget strings (merchant-translatable)
```

### Source and build

The script is dependency-free TypeScript under `storefront/widget/` (plus the pure shared rules in
`lib/storefront/`), bundled by esbuild into the single asset above. Theme extensions have no build
step of their own, so **the built file is committed**:

```
npm run build:widget    # after changing storefront/ or lib/storefront/
```

`storefront/widget/build.test.ts` fails if the committed asset drifts from the source, if it exceeds
the size budget (12 KB gzipped; currently about 6 KB), or if it contains server code, credentials,
or framework code.

### How the storefront reaches our API

Storefront JavaScript calls `https://<shop>/apps/bundlecraft/*` on the merchant's own domain. The
`[app_proxy]` block in `shopify.app.toml` makes Shopify forward those to `/api/storefront/*`, signed
with the app secret. The routes verify that signature (`services/shopify/app-proxy.ts`) and take the
shop from the signed request only, so a customer cannot address another store's data. Only ACTIVE
bundles are ever returned.

### Manual steps (cannot be automated from this repo)

1. Deploy the extension and app config: `shopify app deploy` (or run `shopify app dev`).
2. In the theme editor, add the **BundleCraft bundle** block to the product template.
3. For the landing page, create a collection with the handle `bundles` (so the URL is
   `/collections/bundles`) and add the **BundleCraft bundle list** block to its template.
   Shopify reserves `/collections/*`, so the route itself cannot be created by an app.
4. Make sure the app proxy URL points at the running app (`shopify app dev` updates it automatically).

## bundle-discount (Discount Function)

Applies a bundle's discount at checkout (ACTION-007). Generated with
`shopify app generate extension --template discount --flavor typescript`; API version `2026-07`,
target `cart.lines.discounts.generate.run`.

```
extensions/bundle-discount/
  shopify.extension.toml                       function, one target
  src/cart_lines_discounts_generate_run.graphql  input query
  src/cart_lines_discounts_generate_run.ts     entry: group -> validate -> discount
  src/config.ts        parses + validates the trusted config (never trusts shape)
  src/bundle.ts        finds bundle instances from the cart line properties
  src/validation.ts    fixed / quantity / mix_match completeness (mirrors lib/storefront/selection.ts)
  src/discount.ts      percentage / fixed-amount candidate for one instance
  generated/api.ts     Shopify-generated types (npm run build:function regenerates)
  tests/               fixtures run through the built wasm (npm run test:function)
```

How it decides: the server writes each bundle's rules (products, quantities, type, discount) into
an app-owned metafield on that bundle's automatic discount (`services/discounts/sync.ts`, on
publish). The Function reads only that. From the cart it reads just `_bundle_id` and
`_bundle_instance_id` to _find_ candidate bundles, then requires the lines to form a complete
instance of the configured bundle. Customer-editable properties never supply a value.

- One discount per bundle. Shopify caps active automatic discounts per store (25 at the time of
  writing; confirm against current Shopify docs), which caps active bundles per store the same way.
- The discount is created with `combinesWith` shipping only (a bundle price does not stack with other
  product/order discounts).
- Fixed-amount discounts apply only when the cart currency equals the shop currency.
- Requires the `write_discounts` scope. Existing merchants must re-approve permissions.

```
npm run build:function   # typegen + build the wasm
npm run test:function    # run fixtures through the built wasm (function-runner)
```

Manual steps: `shopify app deploy`, then publish a bundle in the dashboard.
