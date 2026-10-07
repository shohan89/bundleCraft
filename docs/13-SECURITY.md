# BundleCraft Security Architecture

## Security Goals

Protect:

- Merchant data
- Shopify credentials
- Customer information

---

# Authentication Security

Implement:

- Shopify OAuth
- Session validation
- Permission checks

---

# Database Security

Rules:

Every query must filter by shop_id.

Example:

Wrong:

Get all bundles

Correct:

Get bundles where shop_id=current_shop

---

# Token Security

Shopify access tokens:

Never expose

Store encrypted

Never send to frontend

---

# API Security

Every API endpoint:

Must verify:

1. User session

2. Shopify shop

3. Permission

---

# Input Security

Validate:

- Product IDs
- Discount values
- User inputs

---

# Production Security

Enable:

- HTTPS
- Environment variables
- Error monitoring
- Rate limiting


---

# Security posture (ACTION-010 audit)

Verified by automated tests unless marked otherwise. Nothing here has been penetration-tested by a third party.

## In place

- **Route inventory:** every route under `app/api` is classified (merchant session, App Proxy signature, webhook HMAC, OAuth, billing return). A new route that is not classified fails `app/api/api-security.integration.test.ts`.
- **Merchant routes:** session required (401), CSRF header on state-changing calls (403), shop always from the session.
- **Storefront routes:** App Proxy signature and timestamp checked before any data access; shop from the signed value only.
- **Webhooks:** HMAC over the raw body; the shop comes from the verified header; payloads only identify records, state is re-read from Shopify (billing) or taken from order line money (analytics).
- **Body size:** JSON bodies are capped at 256 KB and webhook bodies at 2 MB (413), counted while streaming.
- **Response headers:** `Content-Security-Policy: frame-ancestors https://admin.shopify.com https://*.myshopify.com`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy` (`lib/security-headers.ts`). Confirmed on a running production build.
- **Tokens:** encrypted at rest (AES-GCM), decrypted only in gateway factories, never in API responses, sessions or logs.
- **Rendering:** React escapes dashboard text; the widget builds DOM with text nodes only and allows only https or same-site image URLs.
- **Input:** strict Zod schemas reject unknown fields (including `status`, `shopId`, prices); business rules live once in `lib/bundles/rules.ts`. The only raw SQL is the per-shop billing advisory lock (a parameterised `pg_advisory_xact_lock`); everything else, including analytics aggregation, goes through Prisma.

## Not implemented (known gaps)

- **Rate limiting:** none. Mitigations are signature checks, strict schemas, idempotency keys and size caps. Add edge or per-shop limiting before public launch.
- **Script-restricting CSP:** not set (Next.js inline scripts need per-request nonces).
- **Structured logging / monitoring:** errors are logged with `console.error`; unexpected API errors log the raw error object, which for a Prisma error can include query arguments (the token there is already encrypted). Redaction belongs with the monitoring work.
- **Refunds and cancellations** do not reduce recorded analytics revenue.
- **Dependency advisories:** `npm audit` reports 17 high findings, all in build/dev tooling (`prisma` CLI: `mysql2`, `deepmerge-ts`; `@shopify/shopify_function`: GraphQL codegen `lodash`). None is in the production server bundle (checked). The only automatic fix downgrades Prisma to 6.x, a breaking change, and was not applied.


---

# Webhook security (ACTION-011)

- One pipeline for all webhooks: size cap, then HMAC over the raw body, and only then any parsing, lookup or logging of request data.
- Tenant is the verified shop-domain header; unknown and inactive shops are ignored (inactive shops only accept the uninstall that made them so).
- Durable idempotency (`webhook_events`): duplicate, concurrent and retried deliveries are safe; a failed attempt is never recorded as processed.
- Logs are one JSON line per webhook (request id, topic, shop domain, event id, outcome, status, duration, short error code). Nothing from the request is logged before the signature verifies, and never signatures, secrets, tokens, payloads or customer data.
- Handlers treat payloads as data: subscription state is re-read from Shopify, revenue comes from order line money, uninstall ignores any shop named in the body.
- Not implemented: rate limiting, retention/cleanup of `webhook_events`, refund and cancellation adjustments.


---

# Product catalog security (ACTION-012)

- Every product and variant belongs to one shop; every query is scoped by the authenticated shop, and
  Shopify ids are unique per shop, so the same id in two shops is two rows.
- Another shop's product or variant id is indistinguishable from a made-up one (same `422` or `404`, same
  message) and never leaks a title.
- Shopify data is validated before storing (types, sizes, https-only images); an invalid product is skipped
  and counted, never half stored.
- The product API takes no shop id (rejected as an unknown filter), caps page size at 50, and treats search
  text as data (including LIKE wildcards).
- Sync uses the stored token only inside the gateway; failures surface as `SHOPIFY_API_ERROR` and a short
  code, never a Shopify message.
- The storefront reads local rows, so its request path holds no Shopify credentials.


---

# Landing page security (ACTION-013)

- The listing is served only through the App Proxy: the signature is verified, the shop comes from it, and a
  client-supplied `shopId` or a swapped `shop` parameter has no effect (401 or ignored).
- Active bundles and the shop id are part of the database query, so drafts, inactive bundles and other shops'
  bundles cannot be returned. The catalog read is scoped by the same shop id.
- The card is an allow-list: no ids of products or variants, no customization, status, timestamps, tokens or
  merchant data. A test greps the response for private field names.
- The browser holds no admin token; catalog data comes from the local synced tables, not from Shopify.
- The widget builds the DOM with `createElement` and text nodes (no `innerHTML`), only puts https or same-site
  image URLs in `src`, and keeps the stylesheet free of external requests. Names and descriptions containing
  markup are rendered as text (tested).
- Price display is labelled as a preview; nothing claims a guaranteed checkout total.


---

# Template security (ACTION-014)

- Templates are global application data. The API is read-only (GET handlers only) and requires a merchant
  session; the catalog changes only through the seed. Retiring or restoring a template is a database operation.
- Tenant data stays isolated: choosing a template involves no shop input, and the bundle it is attached to is
  loaded by the session's shop, so another shop cannot read or change it (404).
- A template cannot inject configuration into a bundle: the bundle body is strict (extra fields, including any
  template configuration, are rejected) and the final values are validated server-side by the bundle engine.
- Template configuration is parsed strictly before use: unknown fields, invalid discounts, quantities,
  colours, duplicate roles and any text with angle brackets or control characters make the template
  unavailable instead of being shown or applied.
- The public shape is an allow-list (no shop ids, timestamps, active flag or raw configuration). Unknown and
  retired templates are the same 404. Malformed ids and filters are 400, including any `shopId`.
- The wizard renders all template text as text (React escaping); a test renders markup-like names and checks
  that nothing is parsed.


---

# Customization security (ACTION-015)

A customization is a configuration, never markup or CSS.

- **Only predefined values:** colors are `#RRGGBB` (no `rgb()`, `url()`, `var()`, names or expressions), the font size
  is an integer from 12 to 24, and every other field is one of a fixed list. Fonts are system stacks; there is no
  font URL, `@import` or `@font-face` anywhere.
- **Validated on save, on the server:** the strict validator refuses unknown fields at every level (including a
  `__proto__` key, checked with own-property tests), and rejects the whole request rather than saving part of it.
  The database columns for the options are enums.
- **Sanitised on the way out:** the storefront API and the widget both run `sanitizeCustomization`, so a value that
  somehow bypassed validation (a hand-edited row) becomes that field's default and never reaches CSS.
- **One CSS mapper:** `lib/customization/theme.ts` is the only code that turns a customization into CSS. It sets
  `--bc-*` custom properties whose values are constants from lookup tables or a re-checked hex color or integer. No
  stylesheet or `<style>` is generated, and no string from the merchant is concatenated into CSS. Tests feed hostile
  values (CSS breakouts, `url(javascript:)`, `</style><script>`, `expression()`, `@import`) and assert the output is
  the default theme with only `--bc-` properties.
- **No HTML path:** the widget still renders with `createElement` and text nodes; the dashboard editor renders
  values as text. There is no field that accepts HTML, Liquid, JavaScript or an external URL.
- **Tenant isolation:** the customization API takes the shop from the session; another shop's bundle is a 404 for read
  and write; a `shopId` in the body is an unknown field. Writes need the CSRF header. The storefront response
  carries only the six configuration groups (no ids, shop data or timestamps).
- **Known limits:** colors are valid but not guaranteed readable: the editor warns about low contrast, the button
  label color is automatic, but a merchant can still save a low-contrast text and background pair. Active bundles
  cannot be re-styled without deactivating them.


---

# Error handling, logging, rate limiting and caching (ACTION-016)

**Errors.** Every route returns the shared envelope. Expected problems are `ApiError`s with merchant-safe messages; anything else is a generic 500
with `error.requestId` only: no message, stack, SQL, token or Shopify detail. Sign-in and billing routes use the same logger. Tests force a
database error containing a connection string and a token and check that none of it reaches the response or the log.

**Logging** (`lib/log.ts`). One JSON line per event: `event`, `requestId`, `route` (path only), `method`, `errorName`, `errorCode`, a scrubbed
`message`, and safe identifiers (internal shop id, subscription id). Messages are scrubbed of Shopify tokens, bearer values, credentialed URLs, connection
strings and `key=value` secrets, and truncated to 300 characters. Never logged: access tokens, secrets, cookies, headers, request or webhook bodies, cart or
customer data, stack traces, and query strings (App Proxy query strings carry the signature). Webhook lines (`durationMs`, topic, outcome, no payload) were already compliant.

**Rate limiting** (`lib/api/rate-limit.ts`, `lib/api/limiters.ts`): a fixed window per key held in memory, no new infrastructure. Storefront events 120 a minute and cart 60 a minute per
verified shop and client; OAuth start and callback 30 a minute per client; webhooks refuse a client after 20 BAD signatures in a minute (valid deliveries are not counted, so Shopify
bursts such as a product import are never throttled). Honest limits: counts are per process (on a serverless host the ceiling is per instance and a restart forgets
them), and the client address comes from `X-Forwarded-For`, which only a trusted proxy makes reliable. This bounds a single abusive client or a retry loop; it is not
protection against a distributed attack, which needs the platform's edge protection. `RATE_LIMIT=off` disables it.

**Caching** (`lib/cache/ttl.ts`, per process, size capped): the verified storefront shop (30 s) and the template catalog (60 s). The shop cache is keyed by the domain Shopify's
signature just verified, holds only active shops and only the internal id and domain, is never consulted for an unverified request, is emptied for a shop by the uninstall webhook
(other instances within 30 s, the same window public responses are already cached), and never stores a refusal. Not cached: authentication, sessions, permissions, billing status, tokens, any
merchant data. Changes made here: the session check no longer loads the stored access token column.


---

# Production security review (ACTION-017)

Verified on the production build served with `next start` (see `docs/15` section 6): security headers on every response (CSP `frame-ancestors` limited to the Shopify admin, HSTS, `nosniff`, referrer and permissions policy); merchant API without a session is `401` and uncached (the
edge filter now sends `Cache-Control: no-store` too, and covers `/api/templates`, which it previously did not; the route was already authenticated, this only makes the two layers agree); unsigned storefront requests are `401`; webhooks reject a bad signature with `401`.

- **Health endpoint** `GET /api/health`: public for uptime probes; returns only `{status, database}`, `no-store`, no version, host or error text; a database failure is `503` and one scrubbed log line.
- **Privacy webhooks** (`docs/05`): stored data is limited to what the privacy policy states; `shop/redact` erases a shop's data; a test asserts the database has no shopper personal-data columns (the only email columns are `shops.email`, the merchant's contact, and the unused, empty `users` table).
- **Repository hygiene** (tests): no committable `.env`, no credential-shaped strings outside tests, no secret value from the local `.env` in any committable file, every environment variable the code reads is documented in `.env.example`, `.env.example` holds no values.
- **Pre-flight** `npm run check:production` refuses development URLs, weak or reused secrets and `RATE_LIMIT=off` for production, and prints names only.
- **Migrations** are forward-only and non-destructive (a test allows only the four reviewed `DROP INDEX`/`DROP DEFAULT` statements); applied to an empty schema they reproduce the exact Prisma schema.
- **Not covered:** dependency vulnerability audit (`npm audit` not run), a script-restricting CSP (needs nonces), embedded session-token authentication, live verification against Shopify. Distributed rate limiting needs the platform edge.


---

# Embedded session-token authentication (ACTION-017A)

- Verified independently server-side (signature, algorithm, audience, matched shop, expiry) before any database
  lookup; see `docs/07` for the exact checks and `lib/auth/session-token.test.ts` (22 cases: valid, expired,
  not-yet-valid, issued-in-the-future, every malformed shape, every wrong claim, forged signature, tampered
  payload, wrong audience, mismatched/foreign/non-Shopify shop, "none"/RS256 algorithm confusion, and pure garbage
  input that must never throw).
- The Shopify **access token is never involved**: a session token only proves current shop identity to the
  browser's own requests; it is not a credential for the Admin API, and nothing about it (or the offline token) is
  ever sent to, or readable by, the browser.
- **Never persisted.** Verification is stateless and re-done on every request; no token or its claims are written
  to the database, matching the existing rule for the session cookie.
- **Tenant isolation is unaffected**: every route still resolves the shop from the verified credential
  (whichever one it was) and scopes every query by it; a token naming shop A can never return or alter shop B's
  data (tested directly, and by the existing per-route tenant-isolation suites, unchanged).
- **CSRF protection is unchanged and still required** on every non-GET merchant request, whichever credential
  authenticated it: introducing a second credential does not relax the first one.
- **A present-but-invalid bearer token is always a hard failure**, even alongside a valid cookie — it is never
  silently ignored in favour of the cookie, so a forged or expired token can't be masked by a stale session.
- **Logging**: a bearer token is never logged. `lib/log.ts`'s redaction already strips `Bearer <value>` text, and a
  test forces a failure mid-request with a real (fake) token and confirms no log line or response contains it.
- **Residual, documented limitation** (unchanged by this action): the very first render of a dashboard page (a
  full document load, which cannot carry a custom header) still authenticates with the session cookie only, so it
  keeps whatever cookie-delivery risk existed before for that one moment. Every *interactive* action after that —
  which is effectively all of the app's functionality — now authenticates independently of the cookie. See
  `docs/15`/`docs/16` for the full picture and what remains for a future action.
