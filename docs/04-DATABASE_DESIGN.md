# BundleCraft Database Design

## Database Objective

Design a scalable multi-tenant SaaS database architecture for Shopify merchants.

Database Technology:

- PostgreSQL
- Supabase
- Prisma ORM

The database must support:

- Multiple Shopify stores
- Subscription plans
- Bundle management
- Analytics tracking
- Future expansion

# Database Architecture

## Core Entities

User

Shop

Bundle

BundleProduct

Template

AnalyticsEvent

Subscription

Customization

---

# Entity Relationship

User

|

Shop

|

| | |

Bundle Analytics Subscription

|

BundleProduct

---

# Tables

# 1. Users Table

Purpose:

Store application users.

Table:

users

Fields:

id

UUID Primary Key

email

String

name

String

created_at

Timestamp

updated_at

Timestamp

---

# 2. Shops Table

Purpose:

Store Shopify merchant information.

Table:

shops

Fields:

id

UUID Primary Key

shop_domain

Unique Shopify domain

access_token

Encrypted Shopify token

email

plan

free

starter

growth

pro

status

active

inactive

installed_at

created_at

updated_at

Relations:

One Shop can have:

- Many Bundles
- Many Analytics Events
- One Subscription

---

# 3. Bundles Table

Purpose:

Store merchant created bundles.

Fields:

id

shop_id

title

description

bundle_type

fixed

quantity

mix_match

discount_type

percentage

fixed_amount

discount_value

status

draft

active

inactive

required_quantity (ACTION-005; quantity and mix_match bundles)

template_id (ACTION-005; optional)

shopify_discount_id (ACTION-007; nullable, unique)

The global id of the app-owned Shopify automatic discount that applies this bundle's price at
checkout. Set on first publish and reused for the bundle's whole life, so syncing is idempotent.
Never returned to the client.

discount_synced_at (ACTION-007; nullable)

When the Shopify discount was last synced by a publish or deactivate.

created_at

updated_at

---

# 4. Bundle Products Table

Purpose:

Connect Shopify products with bundles.

Fields:

id

bundle_id

shopify_product_id

shopify_variant_id

quantity

position

created_at

Example:

Bundle:

Summer Outfit

Products:

Shirt

Jeans

Cap

---

# 5. Templates Table

Purpose:

Store predefined bundle templates.

Fields:

id

name

category

fashion

beauty

configuration_json

created_at

Example:

Complete Look Template:

{
sections:[
"top",
"bottom",
"accessory"
]
}

---

# 6. Customizations Table

Purpose:

Store widget appearance settings.

Fields:

id

bundle_id

primary_color

button_color

background_color

layout

card

horizontal

vertical

font_size

created_at

---

# 7. Analytics Events Table

Purpose:

Track bundle performance.

Fields:

id

shop_id

bundle_id

event_type

view

add_to_cart

purchase

revenue

currency (ACTION-008; ISO 4217 code of `revenue`, purchase events only)

order_id (ACTION-008; Shopify order reference, purchase events only)

event_key (ACTION-008; idempotency key, unique per shop with `shop_id`)

metadata_json

created_at

Why the additions: docs/11 requires revenue, and revenue without its currency cannot be summed
correctly; a purchase must reference its order; and retries (double clicks, beacon re-sends,
webhook redelivery) must not inflate counts, which needs a per-shop unique key. Nothing about the
shopper is stored.

New indexes: `(shop_id, event_type, created_at)` for store totals and date filtering,
`(bundle_id, event_type, created_at)` for per-bundle totals, and the unique
`(shop_id, event_key)`.

---

# 8. Subscription Table

Purpose:

Manage Shopify billing.

Fields:

id

shop_id

shopify_charge_id

plan

status

active

cancelled

started_at

cancelled_at

current_period_end (ACTION-009; end of the Shopify billing period, as last reported)

confirmation_url (ACTION-009; Shopify approval URL while pending, so a repeat request resumes it)

is_test (ACTION-009; a Shopify test charge)

created_at / updated_at (ACTION-009)

ACTION-009 changes: `status` gains `pending` and `expired`; `shop_id` is no longer unique, so a
shop keeps its subscription history (at most one row is `active`, enforced under a per-shop
advisory lock); `shopify_charge_id` (the AppSubscription gid) is now unique, so a Shopify
subscription can never be recorded twice. No card or payment data is stored. A shop with no
`active` row is on the Free plan; `shops.plan` mirrors the plan in force.

---

# Index Strategy

Important indexes:

shops.shop_domain

bundles.shop_id

analytics.bundle_id

analytics.created_at

Purpose:

Improve query performance when data grows.

---

# Security Rules

Never expose:

- Shopify access tokens
- Internal database IDs
- Merchant private data

Use:

- UUID IDs
- Encrypted credentials
- Role based access

---

# Future Expansion

Database should support:

- AI recommendations
- Gift bundles
- Subscription bundles
- Multi currency
- B2B pricing
- Advanced analytics


---

# Webhook events (ACTION-011)

Table `webhook_events` is the durable idempotency record for Shopify webhooks: `id`, `shop_id`
(cascade), `topic`, `event_id` (`X-Shopify-Event-Id`, or a body hash when Shopify sends none),
`resource_id` (e.g. a product gid), `status` (`processing`, `processed`, `failed`), `attempts`,
`last_error` (a short code, never a message), `processed_at`, `created_at`, `updated_at`.

- Unique `(shop_id, topic, event_id)`: an event id is scoped to the shop and topic, so it is never
  assumed globally unique. This is what makes duplicate and concurrent deliveries safe.
- Indexes `(status, updated_at)` (find stuck or failed events) and `(shop_id, created_at)`.
- No payload is stored, so no customer data is retained. Retention/cleanup of old rows is not
  implemented yet.

`shops.uninstalled_at` is set by the uninstall webhook and never cleared; sessions issued at or
before it stay invalid after a reinstall. `shops.installed_at` is refreshed on every OAuth install.


---

# Product catalog (ACTION-012)

Shopify is the source of truth; these tables are a synchronised copy of what the bundle builder and
the storefront need. Nothing is edited locally.

**`products`**: `id`, `shop_id` (cascade), `shopify_product_id` (numeric), `title`, `handle`, `status`
(`active`, `draft`, `archived`, `deleted`), `vendor`, `product_type`, `image_url` (https only),
`shopify_updated_at` (an older Shopify copy never overwrites newer data), `deleted_at`, `synced_at`,
`created_at`, `updated_at`. Unique `(shop_id, shopify_product_id)`; indexes `(shop_id, status)` and
`(shop_id, title)`.

**`product_variants`**: `id`, `shop_id` (denormalised so every lookup and the uniqueness are
tenant-scoped in one index), `product_id` (cascade), `shopify_variant_id`, `title`, `sku`, `price`,
`compare_at_price` (shop currency), `available_for_sale`, `image_url`, `position`, `removed_at`,
`synced_at`, timestamps. Unique `(shop_id, shopify_variant_id)`; index `(product_id)`.

**`shops`** gains `catalog_sync_status` (`pending`, `syncing`, `partial`, `synced`, `failed`),
`catalog_sync_cursor`, `catalog_sync_started_at`, `catalog_synced_at`, `catalog_sync_error` (a short code).

Decisions:

- **Deleted products are kept** (`status = deleted`, never revived), not removed: bundles and analytics
  that mention them stay readable. A variant Shopify stops listing is kept with `removed_at` set and
  `available_for_sale = false`.
- **Bundles reference products by Shopify id** (`bundle_products.shopify_product_id` and
  `shopify_variant_id`, unchanged), joined to the catalog by `(shop_id, shopify_variant_id)`. No foreign
  key: a stable external id survives a product being deleted and re-synced, and existing bundles need no
  backfill.
- Not stored: inventory quantities, descriptions, options, metafields, multi-location or Markets data.


---

# Templates table update (ACTION-014)

Migration `20260926200000_template_catalog` (additive; existing rows and every `bundles.template_id`
reference are kept). `templates` now has:

- `slug` (unique, not null): the stable identity of a catalog template (`complete-look`, `weekend-outfit`,
  `seasonal-collection`, `skincare-routine`, `hair-care-kit`). The seed upserts on it. Existing rows were given
  the slug of their name.
- `is_active` (default true): an inactive template stays stored, so bundles keep their reference, but is
  never offered.
- `updated_at`.

`configuration_json` holds one versioned, validated document (`lib/templates/config.ts`): `version`,
`description`, `intendedUse`, `titleSuggestion`, `bundleType`, `requiredQuantity`, `suggestedProductCount`,
`sections` (suggested product roles: `key`, `label`, `hint`), `discount` (`type`, `value`) and `customization`
(colours, layout, font size). It never contains product ids, variant ids, SKUs or merchant data. The older
`{ "sections": [...] }` shape is not valid any more: such a row is treated as unavailable until the seed
rewrites it.

A template is a blueprint, not a bundle. A bundle stores only `template_id` (nullable, `ON DELETE SET NULL`)
and its own copy of every value: nothing is read back from the template after creation, so editing or
retiring a template never changes an existing bundle. Templates are shared by all shops (no `shop_id`).


---

# Customization table update (ACTION-015)

Migration `20260927100000_customization_options` (additive; nothing removed). `customizations` keeps its
columns (`primary_color`, `button_color`, `background_color`, `layout`, `font_size`) and gains:

`accent_color`, `text_color` (`#RRGGBB` text); `font_family` (`theme`, `sans`, `serif`, `mono`); `title_size`,
`description_size` (`small`, `medium`, `large`); `card_radius` (`none`, `small`, `medium`, `large`);
`card_shadow` (`none`, `subtle`, `strong`); `button_style` (`filled`, `outline`); `button_size` (`small`,
`medium`, `large`); `spacing_density` (`compact`, `comfortable`). The option columns are database enums with
defaults, so the database itself refuses an unknown option. Existing rows were backfilled (accent and text
took the old primary colour) so their storefront looks exactly as before.

One row per bundle (unique `bundle_id`, cascade delete), as before. A bundle without a row uses the
centralised defaults (`lib/customization/defaults.ts`). Design is stored on the bundle: a template's
default customization is copied in when the merchant applies it, and the bundle never reads the template again.


---

# Performance: queries and indexes (ACTION-016)

**Measured first.** A synthetic shop (100 bundles, 400 products with 800 variants, 150,000 analytics events) on the
development database showed that latency is dominated by SEQUENTIAL round trips (about 50 ms each to the remote
database), not by SQL cost, so the work targeted the number of statements per request.

**Relation loading.** The Prisma preview feature `relationJoins` is enabled (schema `previewFeatures`, no migration). Bundle
reads that need products and customization, and the variant lookups the storefront uses, pass
`relationLoadStrategy: "join"`, so a bundle with its products and customization is one statement instead of
three, and the storefront's product data is one joined statement instead of three sequential ones.

| Query                                                   | Statements before | After |
| ------------------------------------------------------- | ----------------- | ----- |
| Bundle list / bundle with products and customization   | 3                 | 1     |
| Storefront single bundle with product data              | 6 (plus shop)     | 2     |
| Landing listing                                         | 5 (plus shop)     | 2     |
| Dashboard bundle list (service) | 5 | 3, in 2 rounds |
| `GET /api/billing/current` (incl. session lookup) | 6, in 3 rounds | 5, in 2 rounds |
| `GET /api/analytics/overview` (incl. session and plan check) | 7, in 4 rounds | 5, in 3 rounds |

Analytics: the per-bundle counts and revenue already contain the store totals, so the overview sums them instead of running
two more full scans of the shop's events (at 150,000 events the extra by-type scan alone took about 190 ms).

**Index audit** (tables: shops, bundles, bundle_products, products, product_variants, analytics_events, webhook_events,
subscriptions, customizations). The existing indexes match the queries in use. `EXPLAIN (ANALYZE)` of candidate
indexes on the 150,000-event data showed no gain (index-only scans need a vacuumed visibility map and were equal or
slower), so **no index was added**. Search (`ILIKE '%term%'`) cannot use a B-tree; a trigram index would help a shop with tens of
thousands of products, but at the measured size (400 products, 5 ms) it is not justified.

Removed (migration `20260927200000_drop_redundant_analytics_indexes`):

- Index name: `analytics_events_shop_id_idx`. Table: `analytics_events`. Query improved: every event insert (one index fewer to
  maintain); no read used it because `(shop_id, event_type, created_at)` and the unique `(shop_id, event_key)` start with the same column.
  Expected benefit: cheaper writes, 1.9 MB less per 150,000 rows.
- Index name: `analytics_events_bundle_id_idx`. Table: `analytics_events`. Query improved: every event insert; per-bundle totals and the
  bundle-delete cascade use `(bundle_id, event_type, created_at)` (verified with EXPLAIN, same plans and timings). Expected
  benefit: cheaper writes, 3.2 MB less per 150,000 rows.

Kept on purpose: `(created_at)` (a date-range aggregate used it in EXPLAIN). A test fails if any analytics index becomes a strict prefix of another.

**Remaining limits.** Analytics totals are aggregated on read: cost grows with the events a shop has in the requested range (about
60 to 190 ms per scan at 150,000 events). Beyond a few million events per shop a pre-aggregated daily table would be the next step.
The dashboard bundle list is not paginated (the API is).
