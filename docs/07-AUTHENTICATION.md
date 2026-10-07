# BundleCraft Authentication Architecture

## Purpose

Design a secure authentication system for Shopify merchants.

The system must allow:

- Shopify app installation
- Merchant authorization
- Secure sessions
- Store isolation
- Permission validation

---

# Authentication Technology

BundleCraft uses Shopify recommended authentication flow.

Components:

- Shopify OAuth 2.0
- Shopify App Bridge
- Shopify Session Management
- Prisma Database

---

# Authentication Flow Overview

Merchant opens Shopify App

        ↓

Shopify OAuth Authorization

        ↓

Merchant approves permissions

        ↓

Shopify returns authorization code

        ↓

Backend exchanges code for access token

        ↓

Store information saved in database

        ↓

Create authenticated session

        ↓

Merchant Dashboard access

---

# Shopify OAuth Flow

## Step 1: App Installation

Merchant installs BundleCraft from Shopify App Store.

Shopify sends:

- shop domain
- installation request

Example:

store-name.myshopify.com

---

# Step 2: Authorization Redirect

Backend redirects merchant to Shopify OAuth page.

Shopify requests permission for:

- Products
- Orders
- Themes
- Other required scopes

---

# Step 3: Permission Approval

Merchant approves requested permissions.

Shopify returns:

Authorization code

---

# Step 4: Access Token Exchange

Backend exchanges authorization code.

Input:

- Client ID
- Client Secret
- Authorization code

Output:

Permanent Shopify access token

---

# Step 5: Store Merchant Data

Save:

Shop Table

Fields:

id

shop_domain

access_token

email

plan

status

installed_at

created_at

updated_at

---

# Session Management

## Purpose

Maintain secure merchant login state.

Session stores:

- Shop identity
- User identity
- Session expiry
- Permissions

---

# Session Rules

Every dashboard request must verify:

1. Valid session

2. Connected Shopify shop

3. User authorization

---

# Merchant Isolation

BundleCraft is a multi-tenant SaaS application.

Each Shopify store has isolated data.

Example:

Shop A

shop_id = 001

Can access:

- Own bundles
- Own analytics
- Own settings

Cannot access:

Shop B data

---

# Authorization Layer

Before any database operation:

Check:

Current User

        ↓

Current Shop

        ↓

Requested Resource

        ↓

Permission Validation

---

# API Authentication Rules

Every protected API must:

1. Verify Shopify session

2. Identify shop_id

3. Validate ownership

4. Execute request

---

# Access Token Security

Shopify access tokens are sensitive.

Rules:

Never:

- Send token to frontend
- Store token in client storage
- Log token

Always:

- Encrypt token
- Store server-side only
- Use environment secrets

---

# Database Security

All merchant-related tables must contain:

shop_id

Example:

Bundles table:

id

shop_id

title

Every query:

Correct:

SELECT bundles

WHERE shop_id = current_shop

Wrong:

SELECT all bundles

---

# Authentication Middleware

Create reusable middleware:

Responsibilities:

- Check authentication
- Validate session
- Attach shop context
- Handle unauthorized requests

Example:

Request

↓

Auth Middleware

↓

Shop Context

↓

API Handler

---

# Authentication States

## Installed

Merchant installed app successfully.

## Active Session

Merchant can access dashboard.

## Uninstalled

Shop removed app.

## Subscription Expired

Access limited based on plan.

---

# Uninstall Handling

When merchant removes app:

Shopify sends uninstall webhook.

System should:

1. Mark shop inactive

2. Remove active sessions

3. Keep data according to retention policy

---

# Future Authentication Support

Architecture should allow:

## Team Members

Multiple users per store.

## Staff Permissions

Different access levels.

## Agency Accounts

Manage multiple Shopify stores.

---

# Security Checklist

✓ Shopify OAuth implemented

✓ Sessions secured

✓ Access tokens encrypted

✓ Merchant isolation enforced

✓ API authentication enabled

✓ Permission validation added

✓ Uninstall webhook handled

✓ No sensitive data exposed


---

# Uninstall behaviour (ACTION-011, implemented)

On the `app/uninstalled` webhook (`services/webhooks/handlers/app-uninstalled.ts`):

1. The shop is marked `inactive` (already refused by the session check, storefront routes and gateways) and
   its stored access token is wiped. Shopify has revoked the token on its side.
2. `uninstalled_at` is stamped. Sessions are stateless cookies, so they cannot be deleted; instead any
   session issued at or before `uninstalled_at` is rejected, permanently, including after a reinstall.
3. The plan returns to Free; active subscriptions are marked `cancelled` and unapproved ones `expired`
   (Shopify cancels an app's charges on uninstall). The rows are kept.
4. Live bundles become `inactive` and forget their Shopify discount id (Shopify removes the app's
   discounts), so a reinstall never advertises a price checkout cannot honour. Bundles, analytics and
   webhook history are kept; the merchant re-publishes.
5. Repeating the event changes nothing more. An event triggered before the shop's latest install
   (`X-Shopify-Triggered-At` earlier than `installed_at`) is ignored, so a late delivery cannot switch
   off a shop that has reinstalled.

Nothing is deleted: the retention policy for stored merchant data is not defined yet.


---

# Production notes (ACTION-017)

- OAuth redirects are built from `SHOPIFY_APP_URL` (never the request host), so it must be the public https origin in production and equal `application_url` in the production toml; `npm run check:production` refuses tunnel and localhost values.
- `SESSION_SECRET` (32+ random bytes) signs sessions and derives the access-token encryption key: unique per environment, and rotating it logs everyone out and makes stored tokens undecryptable (merchants must reinstall).
- OAuth start and callback are limited to 30 requests a minute per client (per process).
- **Known risk, not changed in this action:** the dashboard authenticates with a `SameSite=None` cookie inside the Shopify admin iframe. Browsers that block third-party cookies (Safari by default) do not send it, and Shopify expects
  embedded apps to use App Bridge session tokens. Moving to session tokens (token verification on API requests, token exchange for the access token) is required before App Store submission and needs testing in Safari. See `docs/15` section 7 and `docs/16`.


---

# Embedded session-token authentication (ACTION-017A)

**Why.** The dashboard's session cookie is `SameSite=None` (required so it is sent from inside the Shopify admin
iframe at all). Some browsers (Safari by default, and others moving the same direction) block third-party cookies
in cross-site iframes regardless of `SameSite`, so a merchant's interactive actions could silently stop working
even though they were still "logged in." ACTION-017 flagged this; this action resolves it for every merchant API
call **without replacing OAuth or the cookie**, per the brief: give the browser a second, cookie-independent way
to prove which shop it is.

**What changed, in one line:** every dashboard fetch (`lib/api/client.ts`'s `apiRequest`, which every merchant UI
action already goes through) now also sends Shopify's own embedded-app **session token** as
`Authorization: Bearer <token>`, and every merchant API route accepts EITHER that token or the session cookie.

## The token

Shopify's App Bridge script (already loaded in `app/dashboard/layout.tsx` — no new dependency) exposes
`window.shopify.idToken()`, which resolves a short-lived JWT proving "this browser is currently showing shop X
inside the Shopify admin," signed by Shopify with the app's own client secret (HS256). `lib/api/browser-session-token.ts`
reads it; `lib/api/client.ts` attaches it when present and is unchanged when it is not (local development without
App Bridge, or any test).

## Verification (`lib/auth/session-token.ts`)

Verified from scratch with the HMAC primitive already used for OAuth and webhook signatures (`lib/auth/crypto.ts`),
not a general-purpose JWT library — one algorithm is ever valid, so there is no algorithm-confusion surface to
defend against a library:

1. exactly three dot-separated segments, each valid base64url JSON;
2. header `alg` is exactly `"HS256"` (rejects `"none"`, `RS256`, and any other claimed algorithm) and `typ` is
   `"JWT"` or absent;
3. HMAC-SHA256 signature verified against the raw `SHOPIFY_API_SECRET`;
4. every required claim present (`iss`, `dest`, `aud`, `sub`, `exp`, `nbf`, `iat`, `jti`) with the right type;
5. `aud` equals `SHOPIFY_API_KEY`;
6. `dest` and `iss` both name the **same** `*.myshopify.com` shop (`iss` must be exactly `.../admin`);
7. `nbf` not in the future and `exp` not passed, both with a 5-second clock-skew allowance (none on the "already
   expired" side).

Nothing here touches the database or is ever stored: every call re-verifies the token from nothing, exactly like
the session cookie. `lib/auth/shopify-auth.ts`'s `getAuthenticatedShopFromSessionToken` then resolves the live
`Shop` row by `dest` and requires `status = "active"` — an inactive or unknown shop authenticates as nothing,
however fresh the token.

## Where a request may present either credential

`getAuthenticatedShopForRequest(request, cookieValue)` is the one function both `authenticateApiRequest`
(`lib/api/guard.ts`, used by every merchant API route) and the Edge pre-filter (`proxy.ts`) call:

- a request WITH a bearer token is authenticated from that token alone, and a bad one (forged, expired, wrong
  audience, wrong or unknown shop) is a hard failure — it never falls back to a cookie that happens to be present,
  so a stale session can't "rescue" a forged token;
- a request with NO bearer token falls back to the cookie, unchanged from before.

`proxy.ts` (Edge runtime, no Prisma) mirrors the same two-credential check at the cheap pre-filter layer, so a
bearer-only request is not turned away before the authoritative route handler ever inspects it. Both layers still
require the CSRF header on every non-GET request, regardless of which credential authenticated it (`docs/13`).

## What did not change

- **OAuth install/callback**: byte-for-byte the same flow, same encrypted offline access token, same Shop
  upsert. A session token is never exchanged for an access token and never touches it.
- **The session cookie**: still issued at the end of OAuth, still the only credential a full page load (the
  dashboard shell, first paint of every navigation) can use — a browser cannot attach a custom header to a
  document navigation, so this part of the architecture is unchanged and still cookie-dependent (see the residual
  limitation in `docs/15`/`docs/16`).
- **Webhooks and the App Proxy**: neither uses a session token. Webhook HMAC and App Proxy signature verification
  are untouched.
- **Billing**: the browser still never receives the Shopify access token; billing routes authenticate through the
  same `authenticateApiRequest`, so they gained the token path automatically with no code change of their own.

## Failure cases

| Condition                              | Result                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------- |
| No token, no cookie                    | `401 UNAUTHORIZED`                                                     |
| Malformed token (wrong shape, bad JSON) | `401 UNAUTHORIZED`                                                     |
| Wrong algorithm ("none", RS256, ...)    | `401 UNAUTHORIZED`                                                     |
| Forged signature                       | `401 UNAUTHORIZED`                                                     |
| Expired token                          | `401 UNAUTHORIZED`                                                     |
| Wrong audience (another app's token)   | `401 UNAUTHORIZED`                                                     |
| `dest`/`iss` disagree, or not `*.myshopify.com` | `401 UNAUTHORIZED`                                             |
| Token for a shop that was never installed | `401 UNAUTHORIZED` (looks identical to "forged": no existence leak) |
| Token for an inactive/uninstalled shop | `401 UNAUTHORIZED`                                                     |
| Valid token for shop A, request for shop B's data | `404`/empty (the normal tenant-isolation answer; the shop still comes only from the token) |
