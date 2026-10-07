# Shopify Integration Architecture

## Objective

Integrate BundleCraft with Shopify ecosystem using official APIs and extensions.

---

# Shopify Components

BundleCraft uses:

1. Shopify Admin API

2. Shopify Storefront API

3. Theme App Extension

4. Shopify Functions

---

# 1. Shopify Admin API

Purpose:

Merchant dashboard operations.

Used for:

## Products

Fetch:

- Products
- Variants
- Inventory

Example:

Merchant creates bundle:

↓

App fetches products

↓

Merchant selects products

---

## Orders

Used for:

Analytics tracking

Revenue calculation

---

# 2. Storefront API

Purpose:

Customer-facing experience.

Used for:

- Product information
- Cart operations
- Bundle display

---

# 3. Theme App Extension

Purpose:

Display bundle widgets inside Shopify storefront.

Widget locations:

Product Page

Example:

Complete Your Look

Shirt ✓

Jeans ✓

Shoes ✓

Add Bundle $149

Save $30

---

# 4. Shopify Functions

Purpose:

Handle automatic discount logic.

Example:

Normal price:

$150

Bundle price:

$120

Function applies:

$30 discount

---

# Shopify App Flow

Merchant installs app

↓

OAuth approval

↓

Store information saved

↓

Dashboard access

↓

Create bundle

↓

Publish widget

↓

Customer purchases bundle

---

# Required Shopify Permissions

Products:

read_products

Orders:

read_orders

Themes:

write_themes

Discounts (ACTION-007, creates and manages the bundle discount):

write_discounts

Customers:

(optional future)

---

# Extension Architecture

Shopify Theme

|

Theme App Extension

|

BundleCraft Widget

|

Bundle API

|

Database

---

# Future Shopify Features

Support:

- Shopify Markets
- Multiple currencies
- B2B Shopify
- Checkout extensions


---

# Billing (ACTION-009)

App subscriptions use Shopify's Billing API (`appSubscriptionCreate`, `appSubscriptionCancel`, and a
`node` read of the `AppSubscription`); no scope beyond the existing ones is needed. See
`docs/12-BILLING_SYSTEM.md`. `shopify.app.toml` subscribes to `app_subscriptions/update`, which
requires `shopify app deploy`.


---

# Webhooks (ACTION-011)

| Topic                      | Endpoint                                | Does                                                                                           |
| -------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `app/uninstalled`          | `/api/webhooks/app-uninstalled`         | Deactivates the shop, wipes its token, ends sessions and paid plan, keeps history.             |
| `orders/paid`              | `/api/webhooks/orders-paid`             | Hands the order to analytics purchase attribution (`docs/11`).                                 |
| `app_subscriptions/update` | `/api/webhooks/app-subscriptions-update`| Re-reads the subscription from Shopify and syncs it (`docs/12`).                               |
| `products/create,update,delete` | `/api/webhooks/products`           | Authenticated, validated, deduplicated; keeps the product catalog in sync (ACTION-012). |

Every route is a one-line call into `services/webhooks/pipeline.ts`: bounded raw body, HMAC, topic and
shop checks, payload validation, idempotency claim, topic handler (`services/webhooks/handlers/`),
outcome recorded. `lib/webhooks/registry.ts` lists the topics and endpoints.

## Registration

Subscriptions are declared in `shopify.app.toml` (`[[webhooks.subscriptions]]`), which Shopify applies
on `shopify app deploy` for every installed shop. A runtime `registerShopifyWebhooks(shop)` service was
deliberately not built: it would create a second, competing registration path for topics Shopify already
manages from the config file. `lib/webhooks/registry.test.ts` fails if the toml and the registry disagree.

**Not yet registered with Shopify:** nothing is registered until the app is deployed, and this has not
been verified against a real store. Order webhooks may need Shopify's protected customer data approval
for public distribution.

## Idempotency

Shopify may deliver an event more than once, and retries after any non-2xx. The pipeline claims
`(shop, topic, event id)` in `webhook_events` before running a handler: a finished event is a no-op
(200), an event still running returns 409 (Shopify retries), a failed or abandoned event (no update for
5 minutes) is taken over by exactly one retry, and a failure is never recorded as processed.

## Responses

| Situation                                             | Response                    |
| ----------------------------------------------------- | --------------------------- |
| Processed                                             | 200 with a small result     |
| Duplicate of a processed event                        | 200 `{ "duplicate": true }` |
| Same event still being processed                      | 409 (retry later)           |
| Bad or missing signature                              | 401                         |
| Body over 2 MB                                        | 413                         |
| Signed body that is not JSON                          | 400                         |
| Unknown topic, bad shop domain, unknown or inactive shop, unusable payload | 200 `{ "ignored": true }` (retrying cannot help, and Shopify removes subscriptions that keep failing) |
| Handler or store failure                              | 500 (Shopify retries)       |


---

# Product & variant sync (ACTION-012)

Uses the existing `read_products` scope and the shared Admin GraphQL transport
(`services/shopify/graphql.ts`); read-only.

- **Full sync** (`services/products/sync.ts`, `syncCatalog`): pages through `products` with Shopify's
  cursor (20 products and up to 50 variants per page, kept under Shopify's per-query cost limit; extra
  variants of one product are fetched before it is stored, so a product is always complete). Each page is
  stored in one transaction with batched `INSERT ... ON CONFLICT` statements. It is **resumable**: a call
  stops at a time budget (about 20 seconds), saves the cursor and reports `partial`, and the next call
  continues. Only a run that reaches the last page marks products Shopify no longer lists as `deleted`
  (products written after the run began are left alone). One run per shop at a time; an abandoned run is
  reclaimed after 10 minutes.
- **Triggers:** the product picker starts the first sync automatically when the shop has never synced
  (or was reset by a reinstall) and repeats `POST /api/products/sync` until it reports `synced`; the
  "Sync products" button does the same on demand. The OAuth callback never syncs, so installation cannot
  be slowed or broken by a large catalog.
- **Webhooks** (`products/create|update|delete`, see `docs/05` above): create and update fetch the
  authoritative product from Shopify (the payload is only used to learn which product), store it and
  reconcile its variants; delete marks the product deleted. A failure returns 500 so Shopify retries.
- **Convergence:** identity is `(shop, Shopify id)`; a stale copy never overwrites newer data; a deleted
  product is never revived; a product seen by the sync counts as fresh even if its stored copy was newer.
  A webhook during a sync, the same event twice, or two syncs at once all end in Shopify's state.
- **Rate limits:** HTTP 429 and `THROTTLED` errors are retried up to three times with 1, 2 and 4 second
  pauses, then reported as a failed sync; other errors are not retried.
- **Errors:** merchants see only `SHOPIFY_API_ERROR`; the sync state stores a short code
  (`SHOPIFY_PERMISSION`, `SHOPIFY_THROTTLED`, `SYNC_FAILED`); tokens and Shopify responses are never
  logged or returned.
- **Verified live** on the development store: full sync of 17 products and 26 variants in one page, the
  same over 4 pages (page size 5), repeat syncs create nothing new, single-product fetch, archived status.
  **Not live verified:** webhook delivery, variant pagination beyond 50 variants, throttling.


---

# Production configuration and privacy webhooks (ACTION-017)

**Two toml files.** `shopify.app.toml` is the development configuration (localhost URLs, rewritten by `shopify app dev`). The production configuration is created from
`shopify.app.production.toml.example` and checked with `npm run check:production` (real https URLs, redirect and proxy URLs on the application origin, the same scopes as
`services/shopify/oauth.ts`, the App Proxy path `/apps/bundlecraft`, and the privacy topics). Deployment steps, environment variables and rollback are in `docs/15`; the App Store checklist is `docs/16`.

**Mandatory privacy webhooks.** Shopify requires every public app to handle `customers/data_request`, `customers/redact` and `shop/redact`. They are declared in the toml as `compliance_topics` and delivered to
`POST /api/webhooks/compliance`, through the same pipeline as every webhook (HMAC over the raw body first, then idempotency by event id, no payload logged). Handler `services/webhooks/handlers/compliance.ts`:

- `customers/data_request` and `customers/redact`: BundleCraft stores no shopper personal data (no name, email, address, phone, IP or customer id; analytics keep an order reference, amount and currency), so there is
  nothing to return or erase. The request is acknowledged (`200 {"customerDataHeld":false}`) and recorded as a processed event.
- `shop/redact` (sent 48 hours after an uninstall): deletes the shop row; bundles, products and variants, customizations, analytics, subscriptions and webhook history cascade from it. If the shop has reinstalled since (it is active
  again) nothing is deleted. The shop is the one named by the verified header, never the payload. Inactive shops are processed for these topics (they are ignored for every other topic).
  A repeat delivery after the erasure finds no shop and is acknowledged.

**Scopes.** `read_products` (catalog sync), `read_orders` (`orders/paid`), `write_discounts` (the bundle discount) are used; `write_themes` is requested but no code uses it (see `docs/15` section 5).
