# BundleCraft API Specification

## API Architecture

Backend:

Next.js API Routes

Format:

REST API

Authentication:

Shopify OAuth Session

---

# Base URL

Development:

/api

Production:

/api

---

# Authentication APIs

## POST

/api/auth/shopify

Purpose:

Start Shopify OAuth flow.

---

# Bundle APIs

## GET

/api/bundles

Purpose:

Get merchant bundles.

Response:

````json
{
 bundles:[]
}

POST

/api/bundles

Purpose:

Create new bundle.

Request:

{
title:"Summer Outfit",
type:"fixed",
discount:20
}

GET

/api/bundles/:id

Purpose:

Get bundle details.

PUT

/api/bundles/:id

Purpose:

Update bundle.

DELETE

/api/bundles/:id

Purpose:

Delete bundle.

Product APIs
GET

/api/products

Purpose:

Fetch Shopify products.

Analytics APIs
POST

/api/analytics/event

Purpose:

Track events.

Event:

view

add_to_cart

purchase

Billing APIs
POST

/api/billing/create

Purpose:

Create Shopify subscription.

Security Rules

Every API must:

Validate session
Check shop ownership
Validate input
Handle errors

---

# File 4: `docs/07-AUTHENTICATION.md`

```md
# BundleCraft Authentication System


## Authentication Goal


Secure Shopify merchant access.


System must support:


- Shopify OAuth
- Session management
- Merchant isolation



---

# Authentication Flow



Merchant installs app


↓

Shopify OAuth


↓

Permission approval


↓

Receive access token


↓

Save encrypted token


↓

Create shop record


↓

Create session


↓

Dashboard access



---

# OAuth Process



Step 1


Merchant opens app



Step 2


Redirect to Shopify authorization



Step 3


Shopify returns code



Step 4


Exchange code for access token



Step 5


Store token securely



---

# Session Management



Use:


Shopify App Session


Store:


- Shop ID
- User ID
- Expiry



---

# Security Rules



Never:


Store plain access token


Expose credentials


Trust frontend requests


---

# Authorization


Every request must verify:


1. User authenticated


2. Shop exists


3. User owns shop


4. Permission allowed



---

# Future Authentication


Support:


- Team members
- Staff permissions
- Multiple users per store
````

---

# Storefront APIs (public, App Proxy signed)

Called by the theme extension through `https://<shop>/apps/bundlecraft/*`, forwarded to
`/api/storefront/*` with a Shopify signature. No merchant session; the shop is taken from the signed
request. Only ACTIVE bundles are returned, in a storefront-safe shape (no shop id, status,
timestamps, template id, analytics, or tokens).

## GET /api/storefront/bundles

Query (all optional): `bundleId` (uuid) for one bundle with live product details; `productId`
(numeric Shopify product id) for bundles containing that product. No filter lists all active
bundles (no live product lookups). 404 when a requested bundle is not active or not the shop's.

## POST /api/storefront/cart

Body: `{ bundleId, selection: [{ key, variantId, quantity }] }`. Authoritative server-side selection
validation (fixed / quantity / mix & match, variants, quantities). Returns `items` for Shopify's
`/cart/add.js`, each with hidden `_bundle_id`, `_bundle_name`, `_bundle_type`,
`_bundle_instance_id` properties. Does not modify the cart or store anything.

## POST /api/storefront/events

Body: `{ bundleId, event, eventId, instanceId? }`, persisted by the analytics service (ACTION-008); see
"Analytics APIs" below. Returns 202 with `{ accepted, recorded }`.


---

# Shopify discount sync (ACTION-007)

Publishing a bundle makes checkout apply its price. There is no separate endpoint; the existing
bundle lifecycle endpoints do the sync, server-side, with the shop's stored token:

| Endpoint                            | Shopify side effect                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST /api/bundles/:id/publish`     | Creates the bundle's automatic discount on first publish, otherwise updates it; then activates it.             |
| `POST /api/bundles/:id/deactivate`  | Deactivates the discount (kept for re-publishing).                                                             |
| `DELETE /api/bundles/:id`           | Deletes the discount. Aborts if the bundle is active and the discount can't be removed; otherwise proceeds.    |
| `PATCH/PUT /api/bundles/:id`        | None. Only draft/inactive bundles are editable and their discount is off; the next publish re-syncs the rules. |

Ordering: on publish the discount is made ready _before_ the bundle becomes active; on deactivate
it is switched off _before_ the bundle becomes inactive. If the Shopify step fails, the bundle's
status does not change and the request can be retried (every step is idempotent).

New error responses (HTTP 502, status unchanged on the bundle):

- `DISCOUNT_SYNC_FAILED` - Shopify was unreachable or rejected the request.
- `DISCOUNT_PERMISSION_REQUIRED` - the app lacks `write_discounts`. Merchants installed before
  ACTION-007 must reopen the app and approve the new permission.

The Discount Function reads its rules from an app-owned metafield (`$app:bundlecraft` / `config`,
built by `lib/discounts/config.ts`), never from cart line properties.


---

# Analytics APIs (ACTION-008)

Merchant endpoints sit behind the session (`/api/analytics/*` is covered by `proxy.ts` and
`authenticateApiRequest`). The shop is always the authenticated session's shop: a `shopId` query
parameter is ignored. Cross-tenant bundle ids return `404 BUNDLE_NOT_FOUND`.

## GET /api/analytics/overview

Query (all optional): `startDate`, `endDate` (`YYYY-MM-DD`, a whole UTC day, inclusive; or an ISO 8601
timestamp), `bundleId` (uuid, must belong to the shop). Invalid dates, a reversed range or a bad
id return `400 INVALID_REQUEST`.

```json
{
  "success": true,
  "data": {
    "views": 100,
    "adds": 40,
    "purchases": 10,
    "revenue": [{ "currency": "USD", "amount": 1234.5 }],
    "conversionRate": 10,
    "range": { "from": null, "to": null },
    "bundleId": null,
    "byBundle": [{ "bundleId": "...", "title": "...", "views": 0, "adds": 0, "purchases": 0, "revenue": [], "conversionRate": 0 }]
  }
}
```

- `revenue` has one entry per currency (the order's shop currency); currencies are never converted or
  added together. Empty when there are no purchases.
- `conversionRate` = purchases / views x 100, rounded to 2 decimals; `0` when there are no views.
- `byBundle` is the per-bundle breakdown (best first, at most 50) and is empty when `bundleId` is set.

## GET /api/analytics/bundles/:id

Same metrics for one bundle, plus `startDate` / `endDate`: `{ "data": { "analytics": { "bundleId", "title", ...metrics } } }`.

## Recording events

`POST /api/analytics/event` is realised as **`POST /api/storefront/events`** (called by the widget
as `/apps/bundlecraft/events`). Storefront visitors have no merchant session, so the only way to tie
their request to one shop is Shopify's signed App Proxy; `/api/analytics/*` is session-only.

Body (strict; unknown keys such as `shopId` or `revenue` are rejected with 400):

```json
{ "bundleId": "uuid", "event": "bundle_view | bundle_add", "eventId": "uuid", "instanceId": "uuid (optional)" }
```

- `eventId` is an idempotency key; `instanceId` is the cart lines' `_bundle_instance_id`. A repeat of
  either is accepted (202, `recorded: false`) and stored once.
- The bundle must be ACTIVE and belong to the signed shop, otherwise `404`.
- `bundle_purchase` is rejected here: purchases are never client-reported.

## POST /api/webhooks/orders-paid

Shopify `orders/paid` webhook, authenticated by `X-Shopify-Hmac-Sha256` (HMAC of the raw body with the
app secret). Records one `bundle_purchase` per (order, bundle instance) from the order's own line
items. Idempotent on redelivery. Always 200 for things it cannot act on, 500 on failure so Shopify retries.


---

# Billing APIs (ACTION-009)

All merchant endpoints require the session, and the shop is always the session's shop. Bodies never
contain a shop id, price or status. Success and error use the standard envelope.

| Endpoint                                    | Purpose                                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST /api/billing/create` `{ "plan" }`     | Start (or resume) a Shopify subscription for `starter`, `growth` or `pro`. Returns `confirmationUrl`.       |
| `GET /api/billing/current`                  | Plan in force, subscription status, features, active-bundle usage. Verifies a pending change with Shopify.  |
| `POST /api/billing/cancel`                  | Cancel the active paid subscription at Shopify; the shop returns to Free. History is kept.                  |
| `GET /api/billing/callback?charge_id=`      | Shopify's return URL. Reads the subscription back from Shopify; redirects to `/dashboard/billing`.         |
| `POST /api/webhooks/app-subscriptions-update` | HMAC-verified `app_subscriptions/update`; re-reads the subscription from Shopify, then syncs.             |

`plan: "free"` is not creatable: Free is the absence of a paid subscription, reached by cancelling.
A plan change never takes effect until Shopify reports the subscription ACTIVE and its name and
price match the server's plan configuration.

Errors: `INVALID_PLAN` 400, `SUBSCRIPTION_ALREADY_ACTIVE` 409, `SUBSCRIPTION_NOT_FOUND` 404,
`BILLING_CREATION_FAILED` / `SUBSCRIPTION_CANCEL_FAILED` / `BILLING_VERIFICATION_FAILED` /
`SHOPIFY_API_ERROR` 502, `PLAN_LIMIT_REACHED` and `PLAN_FEATURE_UNAVAILABLE` 403.

Plan enforcement on existing endpoints: `POST /api/bundles/:id/publish` returns `PLAN_LIMIT_REACHED`
when the plan's active-bundle limit is reached; `/api/analytics/*` returns `PLAN_FEATURE_UNAVAILABLE`
below the Growth plan (event collection is never gated).


---

# Request limits (ACTION-010)

JSON request bodies are limited to 256 KB and webhook bodies to 2 MB. Larger bodies are refused with
`413 PAYLOAD_TOO_LARGE` before being parsed. There is no rate limiting yet (see `docs/13-SECURITY.md`).


---

# Webhook endpoints (ACTION-011)

`POST /api/webhooks/app-uninstalled`, `/orders-paid`, `/app-subscriptions-update`, `/products`. All are
authenticated only by Shopify's `X-Shopify-Hmac-Sha256` over the raw body (no session, no CSRF header) and
share the pipeline, response table and idempotency described in `docs/05-SHOPIFY_INTEGRATION.md`. The
shop is always the verified `X-Shopify-Shop-Domain`; nothing in a payload selects a tenant. The
`X-Shopify-Event-Id` header is the idempotency key. Responses never contain payload data or internals.


---

# Product APIs (ACTION-012)

Merchant session required (401), shop always the session's shop.

- `GET /api/products?search=&status=&productType=&vendor=&page=&limit=`: the shop's synced products,
  alphabetical, deleted ones never listed. `status` is `active`, `draft` or `archived`; `limit` defaults to
  20 (max 50); `page` starts at 1. Unknown parameters (including `shopId`) are rejected with 400. Search
  matches title and handle case-insensitively, and `%`, `_` and `\` are literal. Response:
  `{ items, page, limit, total, catalog: { status, syncedAt, error } }`; an item has `id`,
  `shopifyProductId`, `title`, `handle`, `status`, `vendor`, `productType`, `imageUrl`, `variantCount`,
  `availableVariantCount`, `available`.
- `GET /api/products/:id` (internal uuid): `{ product }` with its non-removed variants (`shopifyVariantId`,
  `title`, `sku`, `price`, `compareAtPrice`, `availableForSale`, `imageUrl`). Another shop's or a deleted
  product is `404 PRODUCT_NOT_FOUND`.
- `POST /api/products/sync` (CSRF header required, no body): runs or resumes this shop's full sync for
  about 20 seconds. `{ outcome: "synced" | "partial" | "already_running", products, variants, skipped,
  markedDeleted, catalog }`. Shopify failures are a safe `502 SHOPIFY_API_ERROR`.

Bundle endpoints now check products against the synced catalog: `POST /api/bundles` and
`PATCH /api/bundles/:id` (when products are sent) return `422` with `PRODUCT_NOT_FOUND` for any product or
variant that is not in this shop's catalog, whether it belongs to another shop or never existed;
`POST /api/bundles/:id/publish` additionally returns `422 BUNDLE_CANNOT_BE_PUBLISHED` with
`PRODUCT_UNAVAILABLE` for deleted, draft or archived products and removed variants.
`GET /api/bundles/:id` includes `products[].catalog` (`availability`: `available`, `sold_out`,
`unavailable`, `unknown`, plus names, image and price).


---

# Landing page listing (ACTION-013)

`GET /api/storefront/bundles?view=listing` (App Proxy: `/apps/bundlecraft/bundles?view=listing`). Public and
HMAC-signed like every storefront route; the shop always comes from the verified signature. `view` accepts
only `listing` and cannot be combined with `bundleId` or `productId` (400). Other unknown parameters,
including a `shopId`, are ignored.

Returns `{ bundles: StorefrontBundleCard[] }`: ONLY active bundles of the signed shop, newest first, at most 24.
Two database queries however many bundles there are (the bundles with their product rows, then one read of
the synced catalog for all their variants). A card has exactly: `id`, `name`, `description`, `type`,
`requiredQuantity`, `discount { type, value }`, `productCount`, `preview` (up to 4 distinct products, each
`{ title, imageUrl }`), `pricing` (`{ subtotal, total, savings }` for a fixed bundle whose prices are all
known, otherwise `null`) and `availability` (`available`, `sold_out`, `unavailable`, `unknown`). It carries no
product or variant ids, no customization, no status or timestamps.

The full bundle (variants, prices, selection data) is still `GET /bundles?bundleId=...`, fetched only when a
customer opens one card. `POST /cart` and `POST /events` are unchanged, as are the `_bundle_id`,
`_bundle_name`, `_bundle_type` and `_bundle_instance_id` line properties.


---

# Template APIs (ACTION-014)

Merchant session required (401). Templates are application-owned and identical for every shop, so the shop
plays no part; a `shopId` parameter is rejected. Read-only: the route files export `GET` only, so every other
method is a 405 and the catalog can change only through the seed.

- `GET /api/templates?category=fashion|beauty`: `{ templates }`, active and valid templates only, Fashion then
  Beauty, alphabetical, one query. Any other or repeated parameter is `400 INVALID_REQUEST`.
- `GET /api/templates/:id` (uuid): `{ template }`. A malformed id is `400`; an unknown, retired or unreadable
  template is `404 TEMPLATE_NOT_FOUND` with one message, so the two cannot be told apart.

A template has exactly: `id`, `slug`, `name`, `category`, `description`, `intendedUse`, `bundleType`,
`requiredQuantity`, `suggestedProductCount`, `sections[{ key, label, hint }]` and
`defaults { title, discountType, discountValue, customization }`. The configuration is validated (including
the bundle engine's own draft rules) before it is returned; nothing else in the row is exposed.

Bundle endpoints: `POST /api/bundles` and `PATCH /api/bundles/:id` accept `templateId` as before and now
return `422 INVALID_TEMPLATE` when the template does not exist, is retired or is unreadable. On `PATCH`, keeping
the template the bundle already has is always allowed. The body stays strict: template configuration or any
other extra field is rejected, and the final values are validated by the bundle engine, not by the template.


---

# Customization APIs (ACTION-015)

The customization is one nested configuration, used identically by the bundle API, the customization API,
the storefront API and the dashboard:

```json
{
  "layout": "card | horizontal | vertical",
  "colors": { "primary": "#RRGGBB", "button": "#RRGGBB", "background": "#RRGGBB", "accent": "#RRGGBB", "text": "#RRGGBB" },
  "typography": { "fontFamily": "theme | sans | serif | mono", "fontSize": 12-24, "titleSize": "small | medium | large", "descriptionSize": "small | medium | large" },
  "card": { "borderRadius": "none | small | medium | large", "shadow": "none | subtle | strong" },
  "button": { "style": "filled | outline", "size": "small | medium | large" },
  "spacing": { "density": "compact | comfortable" }
}
```

Merchant session required (401), CSRF header on writes (403), shop always the session's shop. Another shop's or an
unknown bundle is `404 BUNDLE_NOT_FOUND`; a malformed id is `400`.

- `GET /api/bundles/:id/customization`: `{ customization }`, the stored values or the defaults (nothing is written).
- `PATCH /api/bundles/:id/customization`: partial update; only the fields sent change, the rest keep their stored values.
- `PUT /api/bundles/:id/customization`: replace; fields left out use the defaults, so `{}` resets to the defaults.

Input is strict and all or nothing: an unknown field at any level (including `shopId`, `css`, `html`), a colour that
is not `#RRGGBB`, an option outside its list, a non-integer or out-of-range font size, or a non-object body is
`422 VALIDATION_ERROR` naming every offending field (`customization.colors.primary`, ...), and nothing is
saved. A body over 256 KB is `413`, invalid JSON `400`. An active bundle cannot be customized (`409
BUNDLE_NOT_EDITABLE`), like the rest of a bundle: deactivate it first.

Bundle endpoints: `customization` on `POST /api/bundles` and `PATCH /api/bundles/:id` uses the same nested shape and
the same strict rules; fields left out take the defaults (a bundle's customization is replaced as a whole there).
`GET /api/bundles/:id` returns it (or `null` when never customized). The former flat shape (`primaryColor`, ...)
is no longer accepted.

Storefront: `customization` on `GET /api/storefront/bundles` (single bundle) and on each landing page card is exactly
the six groups above, sanitised field by field (a bad stored value becomes that field's default) and carrying
no ids, shop data or timestamps.


---

# Performance and hardening changes (ACTION-016)

- **`GET /api/bundles`** is paginated: `?page=` (default 1) and `?limit=` (default 50, maximum 100). The response adds `page`, `limit`
  and `total` next to `bundles`; ordering is newest first with the id as a tie-break, so pages never overlap. Other parameters
  (including `shopId`) and out-of-range values are `400`. A response is bounded by `limit` (about 1 KB per bundle).
- **Request ids.** An unexpected failure returns `500` with `error.requestId` (also the `X-Request-Id` header). A well-formed incoming
  `X-Request-Id` is reused, otherwise one is generated. The same id is on the one server log line for that failure.
- **`429 RATE_LIMITED`** with a `Retry-After` header: storefront `events` (120 a minute per shop and client), storefront `cart` (60 a
  minute), OAuth start and callback (30 a minute per client). Webhooks answer 429 only to a client that has sent 20 bad signatures in a
  minute; valid Shopify deliveries are never counted. See `docs/13`.
- **Caching.** Storefront `bundles` responses stay `Cache-Control: public, max-age=30, stale-while-revalidate=30`; cart and events are `no-store`; merchant
  APIs are `no-store`. Server-side, the verified shop is remembered for 30 seconds and the template catalog for 60 seconds (per process).
  Nothing about billing, authentication, permissions, tokens or merchant data is cached.
- **Measured (development database, 50 ms per round trip, warm caches):** storefront single bundle 300-600 ms to about 105 ms, landing listing 260-370
  ms to about 115 ms, cart check 300-590 ms to about 105 ms, event 150-430 ms to about 105 ms, analytics overview 340-360 ms to about 215 ms,
  bundle list 300 ms (176 in a second run) to about 115 ms and 100 KB to 50 KB.
