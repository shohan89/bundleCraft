# BundleCraft Testing Strategy

## Goal

Ensure reliable Shopify App Store quality.

---

# Testing Layers

## Unit Testing

Test:

- Discount calculation
- Bundle logic
- Validation

---

## Integration Testing

Test:

- Shopify API connection
- Database operations
- Authentication

---

## UI Testing

Test:

- Dashboard flow
- Bundle creation wizard
- Widget behavior

---

## End To End Testing

Scenario:

Merchant installs app

↓

Creates bundle

↓

Publishes widget

↓

Customer purchases bundle

---

# Production Checklist

Before launch:

✓ Authentication tested

✓ Database migrations tested

✓ Shopify APIs working

✓ Extensions working

✓ Billing tested

✓ Error handling complete

✓ Security review complete

# BundleCraft Testing Strategy

## Goal

Ensure reliable Shopify App Store quality.

---

# Testing Layers

## Unit Testing

Test:

- Discount calculation
- Bundle logic
- Validation

---

## Integration Testing

Test:

- Shopify API connection
- Database operations
- Authentication

---

## UI Testing

Test:

- Dashboard flow
- Bundle creation wizard
- Widget behavior

---

## End To End Testing

Scenario:

Merchant installs app

↓

Creates bundle

↓

Publishes widget

↓

Customer purchases bundle

---

# Production Checklist

Before launch:

✓ Authentication tested

✓ Database migrations tested

✓ Shopify APIs working

✓ Extensions working

✓ Billing tested

✓ Error handling complete

✓ Security review complete


---

# Current test suite (ACTION-010)

```
npm test                 # everything below except the wasm run (Vitest; live-database tests need .env)
npm run test:function    # discount Function fixtures through the built wasm and function-runner
npm run lint && npm run typecheck && npm run build
npm run format:check
npx prisma validate && npx prisma migrate status && npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
npx shopify app build    # theme extension (theme check) + Function build
```

| Layer                | What runs                                                                                         | Notes                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Unit                 | rules, discount maths, plans, validation, crypto, sessions, purchase extraction, Function logic  | pure                                                                |
| Integration          | services against the real Postgres (two throwaway shops per file, cascade-deleted afterwards)     | Skipped automatically without `DATABASE_URL`                        |
| API                  | route handlers called directly with real sessions, signatures and HMACs                           | includes the security sweep and hostile-input matrix                |
| UI                   | React Testing Library for dashboard and widget, plus axe-core (WCAG 2.1 A/AA) checks              | colour contrast needs a real browser and is not covered             |
| Contract / journey   | `app/api/e2e.flow.integration.test.ts`: merchant, storefront, Function, webhook, analytics        | Shopify boundaries replaced by fakes                                |
| Shopify fixtures     | 18 Function fixtures through the real wasm                                                        | synthetic cart data                                                 |

## What is NOT verified against real Shopify

- Storefront widget on a real theme, real App Proxy traffic, real add-to-cart.
- Discount Function executing in real checkout, and the Admin GraphQL calls that create the discount.
- `orders/paid` and `app_subscriptions/update` webhook delivery.
- Billing approval and return (Shopify refused `appSubscriptionCreate`: the app needs public distribution).
- Any browser rendering or responsive layout check.

Live-database tests share one remote database and their timing varies, so the Vitest timeout is 30 s
per test. Tests must scope any count to their own shops: other files run in parallel.


---

# Webhook tests (ACTION-011)

`services/webhooks/webhooks.integration.test.ts` (40 tests, real database, requests signed the way Shopify
signs them) covers HMAC, oversized bodies, unknown/inactive/cross-shop handling, idempotency (duplicate,
concurrent, retry after failure, stale takeover, store outage), uninstall, orders, subscription updates
and product events, plus log and response hygiene. `lib/webhooks/registry.test.ts` checks the topic
registry against `shopify.app.toml` and the payload validators.

**NOT LIVE VERIFIED:** registration on a real store, real webhook delivery and retry behaviour, real
`X-Shopify-Event-Id` and `X-Shopify-Triggered-At` header semantics, and real uninstall. The local tests
prove our handling of correctly signed requests only.


---

# Product catalog tests (ACTION-012)

`services/products/products.integration.test.ts` (52 tests, real database, fake Shopify) covers full and
resumable sync, pagination, idempotency, update, variant removal and restore, deletion, stale and deleted
copies, single-product sync, races (webhook during sync, delete during sync, concurrent syncs, stale run),
failures, tenant isolation, queries (filters, pagination, wildcards, no N+1), bundle validation
(cross-shop, unknown, unavailable, publish) and storefront reads. `services/shopify/products.test.ts`
covers gateway paging, variant completion and throttle retry; `lib/products/products.test.ts` the
validation; `app/api/products/products.api.integration.test.ts` the endpoints and bundle API;
`components/dashboard/wizard/ProductSelector.test.tsx` the picker, including axe checks.

**Live verified (development store, read-only):** full sync, 4-page sync, repeat sync, single product.
**NOT LIVE VERIFIED:** product webhook delivery, variant pagination over 50 variants, throttling, a store
with thousands of products.


---

# Landing page tests (ACTION-013)

- `app/api/storefront/landing.integration.test.ts` (real database, signed requests): active-only and tenant
  isolation, deactivate/publish, 24-bundle cap and ordering, card contents and pricing for all three types,
  the 4-product preview, availability transitions (sold out, draft, archived, deleted, removed variant, not in
  catalog), private-field leakage, one catalog query for the whole list, signature and parameter handling.
- `storefront/widget/listing.test.ts`: cards, prices, previews, image safety and sizing, availability states,
  opening a card (one load, one `bundle_view`), cart flow order (`bundle_add` only after Shopify accepts),
  untrusted text, `view` validation and the availability rollup.
- `storefront/widget/page.test.ts`: landing states end to end (skeleton, cards, empty, error and retry, one
  request for several blocks). `storefront/widget/accessibility.test.ts`: axe over cards in every availability
  state and the skeleton. `storefront/widget/landing-extension.test.ts`: locale and snippet strings, noscript,
  responsive CSS contract. `storefront/widget/build.test.ts`: the shipped script matches its source and stays
  under the size budget.

**NOT LIVE VERIFIED:** rendering inside a real theme on a deployed store through the App Proxy, real-device
layout, and the collection page's SEO output. Live checks were limited to the synced development-store catalog
(see the ACTION-013 report).


---

# Template tests (ACTION-014)

- `lib/templates/templates.test.ts`: the catalog (five templates, categories, stable ids and slugs, no product
  ids), configuration validation with 22 rejected cases, the public shape and request parsing.
- `services/templates/templates.integration.test.ts` (real database): seed presence, idempotency and id
  stability, duplicate protection, list, get, category filter, retired and unreadable templates, one query,
  bundle creation and update with templates (submitted values win, retired refused, kept template allowed,
  bundle rules and catalog checks still apply, cross-shop products refused), bundles without or with deleted
  templates, tenant isolation.
- `app/api/templates/templates.api.integration.test.ts`: 401 for anonymous and forged sessions, list, filter,
  detail, 404 and 400 handling, read-only modules, forged configuration and extra fields, the bundle API's
  template errors and the CSRF guard.
- `components/dashboard/BundleWizard.templates.test.tsx`: listing and grouping, preview, applying defaults,
  merchant changes, submitted payload, retired and missing templates, markup as text, axe, keyboard use.
  The older wizard tests now choose a template with preview plus "Use this template".
- `app/api/api-security.integration.test.ts` includes the two new routes in its route inventory and sweeps.

**Live checked (development store, catalog only):** template list, a draft bundle from a template using real
synced products, stored template reference, and the storefront listing and detail for it (bundle set active in
the database, then removed). **NOT LIVE VERIFIED:** publishing a bundle created from a template (no Shopify
discount was created), and the wizard in a browser inside the Shopify admin.


---

# Customization tests (ACTION-015)

- `lib/customization/customization.test.ts` (62): defaults, every option, 19 malicious or invalid color forms, bad
  options, font size bounds and types, unknown fields, prototype-pollution keys, parse/merge behavior, the
  sanitiser (including a hostile-value property check), the theme mapper (allowlisted output only, hostile
  input equals the default theme, readable button labels) and contrast helpers.
- `app/api/bundles/customization.api.integration.test.ts` (50, real database): 401 for anonymous and forged
  sessions, CSRF 403, cross-shop 404 and no change, malformed ids, defaults on read, PATCH merge, PUT replace and
  reset, 26 hostile bodies for both PATCH and PUT (422, nothing stored), body limits, active bundles, the
  bundle API's nested customization and template defaults becoming the bundle's own copy, and the storefront
  response (six groups only, per-field fallback for bad stored values).
- `storefront/widget/theme.test.ts`: the widget and landing cards apply every variable, layout and button style; default
  fallback for missing or garbage input; only `--bc-` properties written; CSS/markup/script injection attempts.
  `storefront/widget/accessibility.test.ts` adds axe over customized widgets and cards in every layout;
  `landing-extension.test.ts` covers the CSS contract (every variable has a fallback and is used, outline and
  layouts, narrow-screen stacking, no fonts or URLs); `build.test.ts` keeps the size budget and drift check.
- `components/dashboard/BundleWizard.design.test.tsx` (23): controls and labels, predefined options only, color typing
  and picker, invalid input, font size errors, contrast advice, reset, keyboard order, axe (including error states),
  live preview (real widget, follows every change, landing card, offline, inert, real products), Next blocked on
  invalid design, save payload and server error display.
- Regression: existing bundle, template, product, storefront, landing, analytics, billing and webhook suites were
  updated only for the new customization shape and pass. Existing tests that used the flat shape were migrated,
  not weakened.

**Live checked (development store, catalog only):** a draft bundle from a template with real synced products, PATCH of its
customization, a rejected `url(javascript:)` color (422), and the storefront detail and landing card returning the
customization (bundle set active directly in the database, then removed). **NOT LIVE VERIFIED:** rendering inside
a real theme through the App Proxy, real-device and cross-browser appearance, `:has()` support on older browsers
(the layout degrades to a tile), and publishing a customized bundle to Shopify.


---

# Performance tests (ACTION-016)

- `services/performance.integration.test.ts` (19, real database, Prisma query events): statement counts per service (one joined statement for bundle reads,
  two for the landing listing and a storefront bundle, one for variant lookups, four for billing state), counts that do not grow with 3 versus 30 bundles (no N+1) and no repeated
  statement, only the named variants are read (never the catalog), the analytics overview equals independent aggregates (counts, two currencies, date range, per-bundle rows,
  tenant isolation, cap), and the index audit (the exact analytics indexes; none redundant).
- `app/api/performance.api.integration.test.ts` (23): pagination (pages never overlap, default and maximum, 400s, response size follows the page size), the storefront shop cache (one lookup
  for many requests, tenant isolated, never used for unverified requests, invalidation, refusals never cached), the template cache (one read, copies, no merchant data, clearing), rate limits on events, cart,
  OAuth and webhooks (valid traffic never counted), and a forced database failure (safe 500, request id, one scrubbed log line).
- `lib/cache/ttl.test.ts`, `lib/api/rate-limit.test.ts`, `lib/log.test.ts` (33): expiry, bounds, windows, redaction and log content.
- `storefront/widget/build.test.ts` adds dependency-regression tests: only widget code and dependency-free shared modules bundled, and under 10 KB gzipped.
- The test setup switches the caches and rate limiting off (`STOREFRONT_SHOP_CACHE_MS=0`, `TEMPLATE_CACHE_MS=0`, `RATE_LIMIT=off`) so database changes are seen at once; the tests above switch them on explicitly.
- Latency numbers in the docs come from a temporary measurement harness (100 bundles, 150,000 events, remote database), removed after the run; the tests assert statement counts, not milliseconds, so they are stable.

**Live checked (development store):** the storefront detail and landing listing on the real synced catalog (4 real products, correct variant counts) through the joined queries. **NOT LIVE VERIFIED:** behavior under real
storefront traffic, the App Proxy, multi-instance cache and rate limit behavior, and production database latency.


---

# Production readiness tests (ACTION-017)

- `services/webhooks/compliance.integration.test.ts` (12, real database, signed requests): bad signatures rejected with nothing deleted; both customer topics acknowledged, idempotent, recorded without any payload data, answered for inactive shops, never logging the customer;
  `shop/redact` erases every table of an uninstalled shop and only that shop, is a no-op for a reinstalled shop, ignores a shop named in the payload, is acknowledged on repeat, and the storefront serves nothing afterwards; a schema audit finds no shopper personal-data columns.
- `lib/deploy/readiness.test.ts` (42): the environment and toml checks (required variables, tunnel and localhost hosts, http, mismatched origins, weak secrets, scopes, proxy path, redirect URLs, privacy topics), that findings never contain values, and that the development toml, the production template (filled in and as shipped) behave as intended.
- `lib/deploy/repository.test.ts` (14): secrets and environment files, `.env.example` completeness against the code, migration safety and ordering, build scripts (`postinstall`, `build`), Node engines, committed widget asset.
- `app/api/health/health.integration.test.ts` (4) and `lib/api/proxy.test.ts` (5, edge session filter). `app/api/api-security.integration.test.ts` now also classifies `/api/health` (public) and `/api/webhooks/compliance`, and the existing webhook suite covers the new endpoint (oversize, signature).
- Manual, once: build from a clean state with no `.env` (16.6 s), `next start` and real HTTP requests (`docs/15` section 6), all migrations applied to an empty schema with a clean status and no drift (`docs/15` section 4). These are recorded results, not repeatable tests.

**Live Shopify verification is still outstanding** (install, publish, checkout discount, webhook delivery, billing approval, Safari): the checklist is in `docs/15` section 8.


---

# Embedded authentication tests (ACTION-017A)

- `lib/auth/session-token.test.ts` (22): every verification rule in isolation (valid, expired, not-yet-valid,
  future-issued, clock-skew boundaries, malformed segments/JSON, missing/wrong-typed claims, "none"/other
  algorithms, wrong `typ`, forged signature, tampered payload, wrong audience, malformed/foreign/mismatched shop,
  and garbage input that must never throw), plus `bearerTokenFrom` header parsing.
- `lib/auth/shopify-auth.session-token.integration.test.ts` (real database): resolves the shop a valid token names
  and only its public fields; null for forged/expired/wrong-audience/malformed/never-installed tokens; null the
  moment a shop is inactive even with a perfectly valid token; a token can never resolve to another shop; the
  combined cookie-or-token resolver never falls back to the cookie when a bearer token is present but invalid,
  agrees with the cookie-only path when no token is presented.
- `app/api/auth-session-token.api.integration.test.ts` (real database, 11 tests) covers exactly the routes named in
  scope — `/api/bundles`, `/api/products`, `/api/templates`, `/api/analytics/overview`, `/api/billing/current`,
  `/api/bundles/:id/customization` — with a valid token, no credential, a forged token, an expired token, another
  shop's token (tenant isolation), an inactive shop's token, a client-supplied `shopId` (rejected as an unknown
  parameter, never used for identity), the CSRF requirement still enforced, and that no response ever contains an
  access token, a session token or a stack trace. A companion test forces a failure and checks the token never
  reaches a log line.
- `lib/api/proxy.test.ts` (+4): the Edge pre-filter accepts a valid bearer token with no cookie at all, refuses a
  present-but-invalid one even alongside a valid cookie, still falls back to the cookie when there is no token,
  and refuses a token outright (never silently ignoring it) when Shopify's credentials aren't configured.
- `lib/api/browser-session-token.test.ts` (5) and `lib/api/client.test.ts` (4): the browser helper degrades to
  `null` (never throws) when App Bridge hasn't loaded, has no `idToken`, or its call fails or resolves to garbage;
  `apiRequest` attaches `Authorization: Bearer` exactly when a token is available and is unchanged when it is not,
  and a token is never placed in a URL or a request body.
- **Regression:** the full suite (1268 tests, up from 1214) was run twice with identical results; every existing
  OAuth, session, webhook, App Proxy, billing and tenant-isolation test still passes unmodified — none of them
  needed to change, because the cookie path is byte-for-byte the same as before.

**Browser testing:** Chrome/Edge/Firefox behaviour was exercised only through the test suite above (jsdom/Node),
not a real browser. **Safari and real embedded-admin behaviour are NOT LIVE VERIFIED** — no browser automation
environment was available in this session. This must be verified on a real development store before relying on it
for App Store submission (see `docs/16`).
