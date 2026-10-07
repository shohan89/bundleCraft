# BundleCraft Production Deployment (ACTION-017)

This is the runbook for taking BundleCraft from a development store to production. It describes what
was verified in this repository and what only a human with the Shopify Partner account, the hosting account
and the production database can do. **Nothing here has been deployed, published or submitted.**

Status legend used below: **Verified** (run in this repository), **Prepared** (documented and checkable, needs your accounts),
**Not verified** (cannot be checked without the live services).

---

# 1. Architecture at a glance

| Part                | What it is                                                                           | Where it runs                                  |
| ------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Web app + API       | Next.js 16 (App Router, Node runtime), Prisma 7 with the `pg` driver adapter         | Your host (Vercel recommended, see section 6) |
| Database            | PostgreSQL (Supabase in development)                                                 | Managed Postgres, `DATABASE_URL` and `DIRECT_URL` |
| Storefront widget   | Theme App Extension `extensions/bundle-widget` (committed JS asset, about 8.9 KB gzipped) | Shopify's CDN, deployed with `shopify app deploy` |
| Discount            | Shopify Function `extensions/bundle-discount` (WASM)                                 | Shopify, deployed with `shopify app deploy`    |
| Storefront requests | App Proxy `https://<shop>/apps/bundlecraft/*` -> `<app>/api/storefront/*`, HMAC signed | Shopify -> your host                          |
| Webhooks            | 5 endpoints, HMAC verified, idempotent                                               | Shopify -> your host                          |

Merchant sessions are a signed cookie issued after Shopify OAuth (see `docs/07`). Everything else is stateless.

---

# 2. Requirements

- **Node.js:** `^20.19.0 || ^22.12.0 || >=24.0.0` (declared in `package.json` `engines`; the intersection of Next.js 16 and Prisma 7).
  Developed and validated on **Node 24.15**; Node 22 LTS is the safe production choice. Not validated on 20.19 or 22 here.
- **npm** (lockfile is `package-lock.json`).
- **Shopify CLI** (`shopify`, already a project dependency via `npm run shopify`) for `app deploy`.
- A **production Shopify app** (a separate app record in the Partner Dashboard from the development one) and a production PostgreSQL database.

**Commands** (the same on any host):

| Purpose      | Command                                                     | Notes                                                                                                              |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Install      | `npm ci`                                                    | `postinstall` runs `prisma generate` (the client is git-ignored, so a clean checkout has none)                     |
| Build        | `npm run build`                                             | `prisma generate && next build`. **Verified** from a clean state with no `.env` present: 16.6 s, no secrets needed at build time |
| Start        | `npm start`                                                 | `next start`; `PORT` is honoured by Next.js                                                                        |
| Migrate      | `npx prisma migrate deploy`                                 | Applies pending migrations only. Uses `DIRECT_URL`                                                                 |
| Seed         | `npx prisma db seed`                                        | Upserts the five templates. **Required once**: the Create Bundle wizard needs them. Safe to repeat                 |
| Pre-flight   | `npm run check:production`                                  | Checks the environment and `shopify.app.production.toml`; prints names, never values; exit 1 on errors             |
| Shopify      | `npx shopify app deploy --config production`                | Extensions, app configuration, webhooks. **Not run** in this action                                                |

---

# 3. Environment variables

Set these in the host's secret store (never in the repository). `.env.example` lists them, and a test fails if code reads a variable that is not documented there.

| Variable                    | Required | Purpose / production value                                                                                                                                       |
| --------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | yes      | Runtime connection. Supabase **transaction-mode** pooler (port 6543, add `?pgbouncer=true`) or any Postgres connection. Used by `lib/prisma.ts`                  |
| `DIRECT_URL`                | yes      | Migrations and `prisma db seed`. Supabase **session-mode** pooler (port 5432) or a direct connection. Used by `prisma7.config.ts`                                  |
| `SHOPIFY_API_KEY`           | yes      | Client ID of the **production** app (equals `client_id` in the production toml)                                                                                   |
| `SHOPIFY_API_SECRET`        | yes      | Client secret of the production app. Verifies OAuth, App Proxy and webhook signatures. Never commit or log it                                                      |
| `SHOPIFY_APP_URL`           | yes      | Public origin of the app, `https://<your-domain>`, no path. Builds OAuth redirects. Must equal `application_url` in the toml                                      |
| `NEXT_PUBLIC_APP_URL`       | yes      | Same origin as `SHOPIFY_APP_URL` (checked by `check:production`). No application code reads it yet; it is part of the deployment contract                         |
| `SESSION_SECRET`            | yes      | 32+ random bytes, base64url: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Signs sessions AND derives the token-encryption key. Unique per environment. **Rotating it logs everyone out and makes stored access tokens undecryptable (merchants must reinstall)** |
| `SHOPIFY_BILLING_LIVE`      | prod     | Exactly `true` for real charges. Anything else creates Shopify **test** charges (nothing is billed). Leave unset on development stores                            |
| `RATE_LIMIT`                | no       | Leave unset. `off` disables rate limiting (`check:production` errors on it)                                                                                       |
| `STOREFRONT_SHOP_CACHE_MS`, `TEMPLATE_CACHE_MS` | no | Cache lifetimes (defaults 30000 and 60000). `0` disables. Leave unset                                                                          |
| `NODE_ENV`                  | platform | `production` (set by `next start` and by hosts)                                                                                                                   |

**Rules the pre-flight check enforces** (`lib/deploy/readiness.ts`, 42 tests): every required variable set; both URLs https, a real host (not localhost, `*.trycloudflare.com`,
`*.ngrok*`, `*.loca.lt` ...), origin only, and identical; database URLs are Postgres and not local; `SESSION_SECRET` at least 32 characters, not a placeholder, not equal to the API secret;
`RATE_LIMIT` not `off`. Warnings: billing in test mode, disabled caches.

**Verified on this machine:** `npm run check:production -- --dev` passes against the current `.env` and `shopify.app.toml`. The strict mode correctly **fails** here (3 errors: the `.env` points at a
development tunnel, `NEXT_PUBLIC_APP_URL` is http, and no production toml exists yet). That is expected: this is a development environment.

**Secrets hygiene, verified:** `.env` is git-ignored and not tracked; `.env.example` contains only empty assignments; no committable file contains a credential-shaped string or any value from the
local `.env`. Tests: `lib/deploy/repository.test.ts`.

---

# 4. Database

**Requirements:** PostgreSQL 15+ (Supabase Postgres in development), UUID generation (`gen_random_uuid()` is built in from Postgres 13), a role that can create tables, enums and indexes.

**Migrations** (10, in `prisma/migrations`): reviewed and **Verified**:

- Applied to an **empty schema** on the development database server, in order, with no errors; `prisma migrate status` then reported "Database schema is up to date" and
  `prisma migrate diff` reported **no drift** against `schema.prisma`. The scratch schema was dropped afterwards.
- No migration drops a table or column, truncates or deletes rows. The only `DROP` statements are three `DROP INDEX` (a superseded unique index in the billing migration and the two redundant analytics
  indexes) and one `DROP DEFAULT`. A test (`lib/deploy/repository.test.ts`) fails if a future migration adds any other kind, forcing a review.
- Index review: see `docs/04` (ACTION-016). No missing index was found for the queries in use.

**First deploy of a new database:**

```bash
export DATABASE_URL=...   DIRECT_URL=...        # the production values
npx prisma migrate status                         # shows every migration as pending on an empty database
npx prisma migrate deploy                         # applies them; never resets, never drops data
npx prisma db seed                                # the five templates (idempotent)
```

**Every later deploy:** `npx prisma migrate deploy` BEFORE the new code starts serving. Never run `prisma migrate dev`, `prisma migrate reset` or `prisma db push` against production.

**Backups:** enable the provider's point-in-time recovery (Supabase: Pro plan PITR) before real merchants install. Migrations are forward-only; recovery from a bad data change is a restore, not a down-migration.

**Known housekeeping:** the `users` table (from the original schema) is unused by the application and empty. Leaving it is harmless; dropping it would be a destructive migration and is deliberately not done here.

---

# 5. Shopify configuration

The repository has two configuration files by design:

| File                                     | Purpose                                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `shopify.app.toml`                       | **Development.** Points at localhost; `shopify app dev` rewrites the URLs to its tunnel (`automatically_update_urls_on_dev`). Never deploy this file to production |
| `shopify.app.production.toml.example`    | **Template** for production. Copy to `shopify.app.production.toml`, replace the two placeholders (`<your-domain>`, `<client-id>`), run `npm run check:production` |

**Audit result (Verified by `lib/deploy/readiness.test.ts` and the pre-flight check):**

| Setting        | Value / rule                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| App name       | `bundlecraft`; `embedded = true` (the dashboard runs inside the Shopify admin; App Bridge is loaded in `app/dashboard/layout.tsx`)       |
| Application URL | `https://<your-domain>` (production). Must equal `SHOPIFY_APP_URL`                                                                       |
| Redirect URL   | `https://<your-domain>/api/auth/callback` (exactly `application_url` + `/api/auth/callback`)                                            |
| Scopes         | `read_products,read_orders,write_themes,write_discounts`, identical in `services/shopify/oauth.ts`, both toml files and `docs/05` (enforced). See "Scope review" below |
| App Proxy      | prefix `apps`, subpath `bundlecraft`, url `https://<your-domain>/api/storefront`. The widget calls `/apps/bundlecraft/...`. Every proxied request is HMAC verified (`services/shopify/app-proxy.ts`), the shop comes only from the signed `shop` parameter, timestamps older than the window are refused |
| Theme extension | `extensions/bundle-widget` (type `theme`): blocks `bundle-widget` (product page) and `bundle-listing` (landing page), snippet, one CSS and one JS asset. **Verified:** `shopify app build` passes |
| Discount Function | `extensions/bundle-discount` (`cart.lines.discounts.generate.run`, WASM). **Verified:** `shopify app build` passes and its 44 tests pass                     |
| Webhooks       | 5 subscriptions, API version `2025-01`: `app/uninstalled`, `app_subscriptions/update`, `orders/paid`, `products/create\|update\|delete`, and the **mandatory privacy topics** `customers/data_request`, `customers/redact`, `shop/redact` (as `compliance_topics`, one endpoint `/api/webhooks/compliance`). A test compares the toml with the code's registry |

**Change made in this action:** the three mandatory privacy webhooks were **missing** (Shopify rejects App Store submissions without them). They are now implemented and declared; see `docs/05`.

**Scope review (decision needed before submission):** `read_products` (catalog sync), `read_orders` (`orders/paid` webhook) and `write_discounts` (the bundle discount) are each used.
**`write_themes` is requested but no code calls a theme API**: the Theme App Extension does not need it. App Store review expects the minimum scopes; unless a planned feature needs it, remove
it from `shopify.app.toml`, `shopify.app.production.toml`, `SHOPIFY_SCOPES` in `services/shopify/oauth.ts` and `docs/05` (the readiness test keeps them in step). It was left in place because
removing it is a product decision.

**Deploy order (production):**

1. Database: migrate and seed (section 4).
2. Host: deploy the app and set the environment; open `https://<your-domain>/api/health` (expect `{"status":"ok","database":"ok"}`).
3. Shopify: `npx shopify app deploy --config production`. This releases the configuration (URLs, scopes, webhooks) and both extensions as one app version.
4. Smoke test (section 8) on a development store using the production app.

---

# 6. Hosting

**Recommended: Vercel** (Node.js functions). The application needs a Node runtime (Prisma `pg` adapter, `crypto`), one edge-compatible file (`proxy.ts`, verified to avoid Prisma), and no long-lived server or file
system writes. **Verified locally** with the production build served by `next start`.

- Region: the same region as the database (each request makes 1 to 5 sequential database round trips, see `docs/04`).
- Function duration: `POST /api/products/sync` works for about 20 seconds per call (it resumes across calls); use a plan or setting that allows at least 30 seconds for it. Everything else is under one second.
- Connection limits: `DATABASE_URL` should be a pooler URL (Supabase transaction pooler) because serverless instances each open their own connections.
- Cloudflare Workers is **not verified** (the `pg` driver needs Node APIs). Any Node host works: `npm ci && npm run build`, then `npm start` behind HTTPS.
- Rate limiting and the two in-memory caches are per process (see `docs/13`); put the platform's edge protection in front for anything distributed.

**Verified over real HTTP against the production build (`next start`, this machine):**

| Request                                                     | Result                                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/health`                                           | 200 `{"status":"ok","database":"ok"}`, `Cache-Control: no-store`        |
| `GET /api/bundles`, `/api/templates` without a session      | 401 JSON envelope                                                       |
| `GET /dashboard` without a session                          | 307 to `/api/auth/shopify`                                              |
| `GET /api/storefront/bundles`, `POST .../events` unsigned   | 401 "Request could not be verified"                                     |
| `POST /api/webhooks/compliance` with a bad signature        | 401 (empty body)                                                        |
| Same with a valid signature for an unknown shop             | 200 `{"ignored":true}`                                                  |
| Every response                                              | `Content-Security-Policy: frame-ancestors https://admin.shopify.com https://*.myshopify.com;`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff` |

---

# 7. Production security checklist

| Area                       | State                                                                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth                      | HMAC and state verified, shop domain validated, token exchanged and **encrypted at rest** (`lib/auth/crypto.ts`), redirect built from `SHOPIFY_APP_URL`, 30 requests a minute per client. Verified by unit and integration tests. **Not verified live in production** |
| Sessions                   | Signed, expiring cookie, re-checked against the live shop record on every API and page request; sessions issued before an uninstall stay dead after a reinstall. See the embedded-auth risk below |
| CSRF                       | Every non-GET merchant request needs the custom header; cross-site simple requests get 403 (tested for every merchant route)                                                                                                |
| HMAC                       | OAuth, App Proxy and webhooks; unsigned, tampered or stale requests are 401 before any data is touched                                                                                                                       |
| Rate limiting              | Storefront events (120/min) and cart (60/min), OAuth (30/min), webhooks refuse a client after 20 bad signatures a minute. Per process; see `docs/13`                                                                          |
| Tenant isolation           | Every query is scoped by the shop from the session or the signed proxy request; cross-shop access is a 404 (tested per route)                                                                                              |
| Database                   | Access tokens encrypted; no shopper personal data stored (`users` is unused and empty); `shop/redact` erases everything a shop owns                                                                                          |
| Logging                    | One scrubbed JSON line per event (request id, route without query string, error class, safe ids); no tokens, secrets, cookies, bodies, cart or customer data                                                                |
| Headers                    | CSP `frame-ancestors` (Shopify admin only), HSTS, `nosniff`, referrer policy, permissions policy on every response; JSON API responses `no-store`. **Verified over HTTP**. A script-restricting CSP is not set (Next.js inline scripts need nonces): known, documented hardening |
| Dependencies               | Not audited in this action (`npm audit` is not part of the validation and was not run)                                                                                                                                      |

**Embedded authentication risk (must read before submitting).** The dashboard authenticates with its own session cookie (`SameSite=None`) inside the Shopify admin iframe. Browsers that block third-party
cookies in iframes (Safari by default, Chrome in some modes) will not send it, so the dashboard would fail to load there, and Shopify's App Store requirements expect embedded apps to authenticate with
**App Bridge session tokens**. This is an architectural change (token exchange and a session-token check on API requests), out of scope for a readiness action, and **not verified in Safari**. It should be
scheduled before App Store submission (see `docs/16`).

---

# 8. Live testing checklist (development store, production or staging app)

Run on a Shopify development store with the app installed from the deployed environment. Tick each box and note the date. None of this could be run from the repository.

**Install**

- [ ] Open the install link; approve scopes; you land in the dashboard inside the Shopify admin (no redirect loop, no blank page).
- [ ] Reload the dashboard, and open it in Safari and in a private window (checks the cookie risk above).
- [ ] A `shops` row exists with `status = active`, an **encrypted** token and no plaintext token.
- [ ] `products` fills after opening the product picker (first sync), status `synced`.

**Bundle flow**

- [ ] Create Bundle: choose a template, pick real products, adjust discount, customize the design (preview updates), save draft.
- [ ] Publish. The bundle becomes active and a Shopify automatic discount exists (Admin > Discounts).
- [ ] Add the theme app block "BundleCraft bundle" on a product page and "BundleCraft bundle list" on the collection with handle `bundles`.
- [ ] Storefront shows the widget with the chosen design and the landing page lists the bundle with images, price and availability.

**Customer flow**

- [ ] View the bundle; select products (mix and match) or use a fixed bundle; Add to cart. The cart shows the lines with hidden `_bundle_*` properties.
- [ ] Checkout applies the bundle discount (Function); the total matches the price shown minus the discount.
- [ ] Try to cheat: change quantities in the cart or remove one line; the discount must not apply.

**Analytics**

- [ ] `analytics_events` gets one `bundle_view` per bundle per page load and one `bundle_add` per successful add.
- [ ] Complete a test order: `orders/paid` records a `bundle_purchase` with revenue (once, even if the webhook is redelivered).
- [ ] The dashboard analytics page matches those numbers.

**Billing** (test mode unless `SHOPIFY_BILLING_LIVE=true`)

- [ ] Choose a paid plan: Shopify approval screen appears; approving returns to the dashboard with the plan active; `subscriptions` row `active`.
- [ ] Cancel; plan returns to Free; active bundles beyond the Free limit are reported (over limit), not deleted.

**Lifecycle**

- [ ] Uninstall the app: shop `inactive`, token wiped, bundles inactive, storefront stops serving (within 30 seconds), analytics kept.
- [ ] Reinstall: dashboard works, old sessions do not, bundles can be republished.
- [ ] Send the three privacy webhooks (Partner Dashboard or `shopify app webhook trigger`): all answered 200; `shop/redact` on an uninstalled shop deletes its rows; on an active shop it deletes nothing.
- [ ] `GET /api/health` is `ok`; force a wrong signature on `/api/webhooks/orders-paid` and confirm 401.

---

# 9. Monitoring readiness (no external service added)

Everything below is already emitted to stdout/stderr as one JSON line per event (the host's log drain collects it). Search by `event` or `outcome`.

| Signal                     | Where it shows up                                                                                                       | Suggested alert                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| API errors (5xx)           | `event:"api_unexpected_error"` with `requestId`, `route`, `errorCode`; the same `requestId` is in the 500 response      | Any occurrence for a route; rate over 1% of requests              |
| Webhook failures           | `webhook:true` lines with `outcome:"failed"` (5xx to Shopify, which retries) or `"rejected"` (bad signature)            | `failed` at all; `rejected` bursts (possible probing)             |
| Shopify API failures       | `billing_operation_failed`, `billing_pending_check_failed`, `billing_verification_mismatch`, `discount_sync_failed`      | Any occurrence                                                    |
| Sync failures              | `catalog_sync_failed`, `product_sync_failed`, `product_sync_invalid_product`; state in `shops.catalog_sync_status = 'failed'` and `catalog_sync_error` | Any `failed` shop                                       |
| Database failures          | `health_database_unavailable`; `/api/health` returns 503                                                                | Uptime check on `/api/health` every minute                        |
| Sign-in problems           | `oauth_callback_failed`, `oauth_start_failed`, `oauth_misconfiguration`                                                 | Any occurrence after a deploy                                     |
| Rate limiting              | 429 responses; `webhook` lines with `errorCode:"RATE_LIMITED"`                                                          | Sustained 429s from one client                                    |
| Privacy requests           | `shop_redacted`, `shop_redact_skipped_reinstalled` events; `webhook_events` rows for the three topics                    | Confirm each `shop/redact` produced `shop_redacted` within 48 h   |

Useful queries (read-only):

```sql
-- Webhook events that failed or have been "processing" for over 5 minutes
SELECT topic, status, attempts, last_error, updated_at FROM webhook_events
WHERE status = 'failed' OR (status = 'processing' AND updated_at < now() - interval '5 minutes')
ORDER BY updated_at DESC LIMIT 50;

-- Shops whose product sync is failing
SELECT shop_domain, catalog_sync_status, catalog_sync_error, catalog_synced_at FROM shops
WHERE catalog_sync_status = 'failed';

-- Active bundles whose Shopify discount was never created (publish problems)
SELECT id, shop_id, title FROM bundles WHERE status = 'active' AND shopify_discount_id IS NULL;
```

Limitations: no dashboards, no paging, no log retention are configured here; that belongs to the hosting platform and the next action.

---

# 10. Rollback

| Layer       | How                                                                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App code    | Redeploy the previous build on the host (Vercel: promote the previous deployment). Migrations are additive and the previous code runs on the newer schema except where noted below, so roll the code back first                |
| Shopify     | The app configuration and extensions are versioned: release the previous app version (Partner Dashboard > Versions, or `shopify app release --version <name>`). Webhook and proxy URLs come back with it                  |
| Database    | There are no down-migrations. For a bad data change use point-in-time recovery. For a bad migration, fix forward with a new migration. Never `migrate reset` in production                                                |
| Secrets     | A leaked `SHOPIFY_API_SECRET`: rotate it in the Partner Dashboard and the host, redeploy. A leaked `SESSION_SECRET`: rotate it (every merchant must reinstall; see section 3)                                             |

**Compatibility note for code-only rollback:** the migration `20260926200000_template_catalog` made `templates.slug` required. Code from before it would fail only if it inserts templates (the seed); the running app only reads them. All other
migrations add columns with defaults or drop redundant indexes.

**Emergency stop:** to stop serving the storefront quickly without a deploy, deactivate bundles in the dashboard (or set them `inactive` in the database); the widget shows nothing within about 30 seconds.

---

# 11. Git and release preparation

Working tree at the time of writing: **48 modified and about 270 new files** (ACTIONs 005 to 017), all **uncommitted**, on `main`, which is **2 commits ahead of `origin/main`** (two OAuth fixes made after ACTION-004 and not pushed). Nothing was committed or pushed in this action. Git reports that line endings will be normalised to CRLF on the next commit (Windows `autocrlf`); that is harmless but will show every touched file as changed once.

Rules: never commit `.env*` (except `.env.example`), tokens, or the generated Prisma client (`/lib/generated/prisma` is ignored). The repository test above enforces the first two.

Suggested history (one reviewable commit per action, oldest first; use `git add <paths>` per group, then `git commit`):

| Commit                                                         | Contents                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `feat: bundle engine, dashboard integration (ACTION-005)`      | `services/bundles`, `lib/bundles`, bundle API routes, wizard/table changes, schema migration `bundle_engine_fields` |
| `feat: storefront widget and theme extension (ACTION-006)`     | `storefront/`, `extensions/bundle-widget`, `app/api/storefront`, `scripts/build-widget.mjs`     |
| `feat: shopify discount function (ACTION-007)`                 | `extensions/bundle-discount`, `services/discounts`, migration `bundle_shopify_discount`         |
| `feat: analytics system (ACTION-008)`                          | `services/analytics`, `lib/analytics`, migration `analytics_event_tracking`                     |
| `feat: billing (ACTION-009)`                                   | `services/billing`, `lib/billing`, migration `billing_subscription_lifecycle`                   |
| `test: production readiness audit (ACTION-010)`                | Integration and hardening tests, `lib/api/hardening`                                            |
| `feat: webhooks pipeline (ACTION-011)`                         | `services/webhooks`, `lib/webhooks`, migration `webhook_events`                                 |
| `feat: product catalog sync (ACTION-012)`                      | `services/products`, product API, migration `product_catalog`                                   |
| `feat: bundle landing page (ACTION-013)`                       | landing listing, widget listing, CSS                                                            |
| `feat: bundle templates (ACTION-014)`                          | `lib/templates`, `services/templates`, migration `template_catalog`                             |
| `feat: theme customization (ACTION-015)`                       | `lib/customization`, migration `customization_options`                                          |
| `perf: query, cache, logging and rate limiting (ACTION-016)`   | joined queries, `lib/cache`, `lib/log.ts`, `lib/api/rate-limit.ts`, migration `drop_redundant_analytics_indexes` |
| `chore: production readiness (ACTION-017)`                     | compliance webhooks, health route, `lib/deploy`, `scripts/check-production.ts`, docs 15 and 16, toml template |

Files touched by several actions (`prisma/schema.prisma`, `docs/*`, `package.json`) cannot be split cleanly after the fact; commit them with the last action that changed them or use `git add -p`.
Branches: keep `main` releasable and protected; deploy from `main` (or a `release/x.y` branch for hotfixes); tag each production deploy (`v0.1.0`, ...) and record the Shopify app version name next to it.
There is **no CI** in the repository. A minimal pipeline is: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npx prisma validate`, `npm run test:function`, `npx shopify app build`.
Tests that need the database (`*.integration.test.ts`) skip themselves when `DATABASE_URL` is missing; give CI a throwaway database, never the production one.

---

# 12. Known limitations at this point

- Nothing has been deployed: hosting, domain, TLS, the production Shopify app and the production database do not exist yet.
- Webhook delivery from Shopify, live billing, the discount at real checkout, the App Proxy through a real storefront and real-device layout are **not live verified** (see the checklist in section 8).
- Embedded authentication uses a cookie, not App Bridge session tokens (section 7).
- Per-process caches and rate limits (section 7 and `docs/13`).
- `write_themes` scope unused (section 5).
- The privacy policy, terms, support page and store listing assets do not exist yet (`docs/16`).


---

# Embedded session-token authentication (ACTION-017A)

No new environment variables: the token is verified with the existing `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET`.
No new Shopify configuration or scopes; App Bridge was already loaded from the CDN in `app/dashboard/layout.tsx`.

Section 7 of this document ("Embedded authentication risk") is updated by this action: merchant API requests
(create/edit/publish a bundle, product search and sync, template selection, customization save/read, analytics,
billing actions — effectively all interactive functionality) now authenticate with a Shopify session token
verified independently of the session cookie, and are tested end to end (`docs/14`). The one part that remains
cookie-only is the very first render of each full page load, which cannot carry a session token (a browser
navigation cannot attach a custom header) — see `docs/07` and `docs/16` for the precise, honest scope of what is
and is not resolved. **Not live verified**: real Safari behaviour, and the embedded dashboard on a real development
store. Both should be checked as part of the live-testing checklist (section 8 of this document) before
submission.
