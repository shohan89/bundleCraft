# Analytics System Architecture

## Purpose

Track bundle performance and merchant revenue impact.

---

# Events

System tracks:

## Bundle View

When customer sees bundle.

Event:

bundle_view

---

## Add To Cart

When customer adds bundle.

Event:

bundle_add

---

## Purchase

When bundle order completes.

Event:

bundle_purchase

---

# Analytics Data

Store:

- Event type
- Bundle ID
- Shop ID
- Revenue
- Timestamp

---

# Dashboard Metrics

Display:

## Bundle Revenue

Total revenue generated.

## Orders

Number of bundle purchases.

## Conversion Rate

Views compared to purchases.

## AOV Increase

Revenue improvement.

---

# Future Analytics

Support:

- Revenue reports
- Export CSV
- Advanced charts
- Customer insights

# Analytics System Architecture

## Purpose

Track bundle performance and merchant revenue impact.

---

# Events

System tracks:

## Bundle View

When customer sees bundle.

Event:

bundle_view

---

## Add To Cart

When customer adds bundle.

Event:

bundle_add

---

## Purchase

When bundle order completes.

Event:

bundle_purchase

---

# Analytics Data

Store:

- Event type
- Bundle ID
- Shop ID
- Revenue
- Timestamp

---

# Dashboard Metrics

Display:

## Bundle Revenue

Total revenue generated.

## Orders

Number of bundle purchases.

## Conversion Rate

Views compared to purchases.

## AOV Increase

Revenue improvement.

---

# Future Analytics

Support:

- Revenue reports
- Export CSV
- Advanced charts
- Customer insights


---

# Implementation (ACTION-008)

## Flow

```
Widget (storefront/widget/analytics.ts)  -- bundle_view / bundle_add, fire-and-forget
  -> /apps/bundlecraft/events (Shopify App Proxy, signed)
  -> POST /api/storefront/events -> services/analytics/track.ts -> analytics_events

Shopify orders/paid webhook (HMAC)
  -> POST /api/webhooks/orders-paid -> services/analytics/purchases.ts -> analytics_events

Dashboard -> GET /api/analytics/overview | /bundles/:id -> services/analytics/queries.ts (SQL GROUP BY)
```

Code: `lib/analytics/` (types, metrics, validation, purchase extraction; pure) and
`services/analytics/` (track, purchases, queries; Prisma). Routes hold no analytics logic.

## Trust model

| Event           | Source                              | Trust                                                       |
| --------------- | ----------------------------------- | ----------------------------------------------------------- |
| `bundle_view`   | browser                             | Low: a counter. Shop from the App Proxy signature.          |
| `bundle_add`    | browser, after Shopify accepted add | Low: a counter. Deduplicated by cart instance id.           |
| `bundle_purchase` | Shopify order webhook (HMAC)      | High: revenue from the order's own line money, shop currency. |

Views and adds carry no revenue. A client can neither name a shop nor supply revenue.

## Purchase attribution

The widget adds cart lines with `_bundle_id` and `_bundle_instance_id` properties; Shopify copies
them onto the order's line items. The webhook groups lines by (bundle, instance): revenue is
`price x quantity - discount allocations` per line, in the shop currency (excluding tax and shipping).
Only bundles of the webhook's shop are recorded. Limits: attribution relies on those properties (a
shopper editing them can only mis-attribute their own order within the same shop); refunds,
cancellations and post-payment edits do not reduce recorded revenue; orders placed without the widget
are not bundle purchases.

## Manual steps (not done by the code, not verified live)

1. Run `shopify app deploy`. The `orders/paid` subscription is declared in `shopify.app.toml` and
   handled by the shared webhook pipeline (`docs/05-SHOPIFY_INTEGRATION.md`); it is not active until deployed.
2. Order webhooks may require Shopify's "protected customer data" access for public distribution.
   The handler stores no customer data, but Shopify's approval process is separate.
3. `SHOPIFY_API_SECRET` must be set in the environment (it verifies both the App Proxy and webhooks).
4. Deploy the theme extension (`shopify app deploy`) so storefronts run the widget build that sends
   idempotency ids.

## Dashboard

Home (`/dashboard`) shows all-time totals from the same service. `/dashboard/analytics` fetches
`/api/analytics/overview` with a period filter (all time, today, 7 days, 30 days; UTC) and a bundle
filter, with loading, empty and error states and a per-bundle table.


---

# Landing page events (ACTION-013)

No new events. Listing the cards records nothing. `bundle_view` is sent once per bundle per page (de-duplicated by
the shared tracker) when a customer opens a card, because that is when the bundle is actually displayed in full;
`bundle_add` is sent only after Shopify accepted the cart add. Failed loads, sold out or unavailable cards and
refused cart adds record nothing. The browser never reports revenue or purchases.


---

# Analytics performance (ACTION-016)

`GET /api/analytics/overview` now runs two aggregate statements (counts by bundle and event type, revenue by bundle and currency) plus one
lookup of bundle titles, all at the same time; the store totals are summed from the per-bundle rows instead of scanning the events twice more.
Single-bundle requests check ownership and aggregate concurrently. Aggregation is done by PostgreSQL (`COUNT` and `SUM ... GROUP BY`),
raw events are never loaded, filtering by date uses the `(shop_id, event_type, created_at)` index, and the per-bundle breakdown is capped at 50
rows. Tests compare the overview with independent aggregates (with and without a date range, two currencies) and check the statement count.
Two redundant single-column indexes on `analytics_events` were dropped (see `docs/04`). Event writes (`bundle_view`, `bundle_add`) are two statements
(bundle check, insert), with the shop lookup cached. Limitation: totals are computed on read, see `docs/04`.
