# BundleCraft Storefront Widget Architecture

## Purpose

Create a fast, beautiful, mobile-first bundle shopping experience for Shopify customers.

The widget is the main customer-facing feature.

---

# Widget Types

BundleCraft supports:

## 1. Product Page Widget

Location:

Shopify Product Page

Example:

Complete Your Look

---

✓ Shirt

✓ Jeans

✓ Shoes

Bundle Price:

$149

Save:

$30

[ Add Bundle ]

---

## 2. Bundle Landing Page

URL:

/collections/bundles

Purpose:

Show all available bundles.

---

# Widget Technology

Built using:

Shopify Theme App Extension

Frontend:

- React
- TypeScript
- Shopify Extension APIs

---

# Widget Flow

Customer visits product page

↓

Widget loads bundle configuration

↓

Fetch bundle data

↓

Display products

↓

Customer selects products

↓

Click Add Bundle

↓

Products added to Shopify cart

↓

Checkout

---

# Widget Features

Merchant controls:

- Colors
- Typography
- Button style
- Layout

Layouts:

Card

Horizontal

Vertical

---

# Performance Requirements

Widget must:

- Load fast
- Avoid blocking theme
- Use lazy loading
- Minimize JavaScript

---

# Mobile First

Priority:

Mobile shopping experience.

Must support:

- Small screens
- Touch interaction
- Fast loading

---

# Future Features

Support:

- Bundle recommendations
- AI suggestions
- Personalized bundles


---

# Product data source (ACTION-012)

The widget's product titles, images, variants, prices and availability are read from the shop's
**synced catalog** (`services/storefront/product-info.ts`), not from Shopify per page view: two indexed
queries per request, no Shopify API calls and no access token involved, scoped by the shop from the signed
App Proxy request. A variant of a deleted, draft or archived product, or one Shopify removed, is reported
unavailable (never dropped), so the widget shows it sold out and the authoritative cart check refuses it
with 422. A variant that was never synced is absent, and the widget falls back to the configured variant
with no display data. Freshness depends on the product webhooks and syncs (see `docs/05`).


---

# Bundle landing page (ACTION-013)

**Where it lives.** Shopify reserves `/collections/*`, so the page is not an app route. The merchant creates a
collection whose handle is `bundles` and adds the **BundleCraft bundle list** app block to its template. The
page's title, description and canonical URL are the theme's (the collection's), which is also where a
merchant edits them. The block renders one `<h2>` (its heading setting, default "Bundles") and semantic
`ul > li > article` cards, each named by its own `<h3>`. Visitors without JavaScript get a plain message
(`<noscript>`), and no structured data is emitted.

**Cards.** Each card shows up to four product preview images (Shopify CDN images are requested at 240 px
wide; anything not https is replaced by a named placeholder), name, type ("Fixed bundle", "Quantity bundle",
"Mix & match"), product count, description, a "Save 20%" or "Save $15.00" badge, availability and a button.
A fixed bundle also shows its regular and bundle price (`lib/storefront/pricing.ts`, the bundle engine's own
math). Quantity and mix & match bundles show no price ("Price depends on your selection") because it depends on
the selection. Every card says "The discount is applied at checkout": the card price is a preview, and the
Shopify Function decides the real amount.

**Availability** comes from the synced catalog (`lib/storefront/availability.ts`). Fixed: the worst product state
wins. Quantity and mix & match: one buyable product is enough. `sold_out` and `unavailable` cards say so in text
and their button is disabled; `unknown` (a product not in the catalog yet) claims nothing and can be opened.
Deleted, draft and archived products, and removed variants, are always `unavailable`. This only decides what a
card says: the authoritative cart check still refuses anything that is not buyable.

**Opening a bundle.** "View bundle" (fixed) or "Choose items" (quantity, mix & match) opens the existing
interactive widget in the card, loaded on demand, and the card widens to a full row. That widget is the only code
that selects products, calls `/cart` and Shopify's `/cart/add.js`, and reports analytics, so the selection rules,
cart properties and events are identical to the product page.

**States.** Loading shows placeholder cards plus one status message; an empty shop shows "No bundles are
available right now" under the heading; a failed load shows a friendly message with "Try again" that refetches;
a card whose bundle vanished says it is unavailable. Server text is never shown, and every value from the server is
inserted as text (`textContent` or attributes), never as HTML.

**Layout.** Fluid grid (`minmax(min(100%, 16rem), 1fr)`), one column at 480 px and below, 44 px touch targets,
reduced-motion support. Real-device and real-browser visual testing has not been done.


---

# Customization (ACTION-015)

Flow: merchant dashboard -> `customizations` row -> storefront API (`customization`, six groups) -> widget or
landing card -> CSS custom properties. There is one mapper, `lib/customization/theme.ts` (`applyTheme`), used by the
product page widget, every landing page card and the dashboard preview. It writes only `--bc-*` custom properties
and two attributes (`data-layout`, `data-button-style`) on the widget root or card element: no stylesheet is
generated, no `<style>` element is created, no font or URL is loaded.

| Setting                   | Effect                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| layout                    | product grid: card (tiles), horizontal (wrapping row), vertical (one column); landing cards: tile, full-width row with images left, full-width row |
| primary                   | headings                                                                                                                                       |
| text                      | body text                                                                                                                                      |
| background                | widget and card background                                                                                                                     |
| accent                    | focus outline and selected product border                                                                                                      |
| button                    | button, badge and outline colour; its label colour is chosen automatically (black or white, whichever reads better)                           |
| fontFamily                | `theme` inherits the store's font; `sans`, `serif`, `mono` are system font stacks                                                              |
| fontSize, title, description | base size in px (12 to 24) and heading and description scales                                                                                |
| card                      | corner radius (0, 6, 12, 20 px) and shadow                                                                                                     |
| button                    | filled or outline; small, medium, large (the touch target stays at least 44 px)                                                                |
| spacing                   | compact or comfortable padding and gaps                                                                                                        |

Fallbacks: a bundle without a customization, or a value that fails its check, uses the default for that field only
(`sanitizeCustomization`), so an invalid stored value can never break or restyle the storefront beyond its own
field. The CSS holds the same defaults for the moment before the script runs. The horizontal landing card stacks
on screens up to 600 px wide, and colours only ever come from the merchant's validated choices (no user-supplied
CSS). The script grew from about 7.2 KB to about 8.9 KB gzipped (budget 12 KB).

The landing page card call to action now uses the themed primary button (it was a secondary style) so button
style and size apply to it.


---

# Performance (ACTION-016)

Size: 23.6 KB raw, **8.9 KB gzipped** of a 12 KB budget (a test now also requires under 10 KB, and that only widget code and the
dependency-free shared modules are bundled: no `node_modules`, no Zod or React). The composition is already lean (the largest part is the
bundle widget itself at about 5.4 KB minified), so nothing was removed for its own sake.

Requests: the landing page makes one listing request however many blocks it has (shared in-flight and cached per page); opening a card
loads that bundle once; a product page makes one request; events are sent once per bundle view and once per successful add. No Shopify
calls happen from the browser, and on the server the storefront reads the local synced catalog.

Images: https only; Shopify CDN images are requested at card size (`?width=240` for landing previews, `?width=400` for product photos,
which display at most 250 px), `loading="lazy"`, `decoding="async"` and explicit width and height, so nothing shifts. Nothing is downloaded
or stored by the app.

The dashboard's design preview (which contains the whole widget) is loaded on demand when the Design step opens: a separate chunk of about 7.4 KB
gzipped that is no longer part of the first wizard load.
