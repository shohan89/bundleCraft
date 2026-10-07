# BundleCraft App Store Readiness Checklist (ACTION-017)

Preparation only: **nothing has been submitted, published or changed in the Partner Dashboard.** Each item is marked
**Done** (in the repository, verified), **Todo** (needs a person or an account), or **Risk** (a known problem that can fail review).
This is an engineering checklist based on the code as it is; check Shopify's current App Store requirements before submitting, because
they change.

---

# 1. Blockers to resolve before submitting

| #   | Item                                                                                                                                                                                                                                                                                   | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | **Session-token authentication.** The embedded dashboard uses its own third-party-style cookie (`SameSite=None`) inside the Shopify admin iframe. Safari and privacy modes block it, and Shopify expects embedded apps to use App Bridge session tokens. Needs a dedicated change (App Bridge token, server-side token verification or token exchange) and testing in Safari | **Risk** |
| 2   | **Production hosting, domain and database** do not exist yet; the production app record, `shopify.app.production.toml` and secrets must be created (`docs/15`)                                                                                                                       | Todo   |
| 3   | **Live verification on a development store** (install, publish, storefront, checkout discount, webhooks, billing approval) has not been done; use the checklist in `docs/15` section 8                                                                                            | Todo   |
| 4   | **Protected customer data.** `orders/paid` payloads contain customer data. The app stores none of it (order reference, amount and currency only), but the webhook topic needs the Partner Dashboard "Protected customer data" declaration and, for some levels, approval. Declare it truthfully                | Todo   |
| 5   | **Scope minimisation.** `write_themes` is requested but unused (`docs/15` section 5). Remove it unless a feature needs it, so review does not question it                                                                                                                       | Todo   |
| 6   | **Public pages** (privacy policy, terms, support, documentation) and the store listing assets do not exist yet (section 3)                                                                                                                                                       | Todo   |
| 7   | **Live billing** has not been verified with a real approval flow (test charges only so far); set `SHOPIFY_BILLING_LIVE=true` only in the production environment when ready                                                                                                       | Todo   |

---

# 2. App information (listing)

| Field            | Proposed content (edit before use)                                                                                                                                                                                                                                                     | Status |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| App name         | BundleCraft (30 characters max; check it is not already taken and does not use "Shopify")                                                                                                                                                                                             | Todo   |
| Tagline          | Beautiful product bundles that raise your average order value                                                                                                                                                                                                                         | Todo   |
| Description      | For fashion and beauty stores: create fixed, quantity and mix and match bundles from ready-made templates, show them on product pages and on a dedicated bundles page, customize the look without code, and see views, adds and purchases. The bundle discount is applied at checkout by a Shopify Function | Todo   |
| Feature list     | Five templates (Complete Look, Weekend Outfit, Seasonal Collection, Skincare Routine, Hair Care Kit); fixed, quantity and mix and match bundles; percentage or fixed discounts applied at checkout; product page widget and bundle landing page; design controls (layout, colors, typography, cards, buttons) with live preview; analytics; plans through Shopify billing | Done (matches the code) |
| Screenshots      | Capture from a demo store: create-bundle template step, design step with preview, bundles list, analytics, product page widget, bundles landing page, checkout with the discount, billing page. Required sizes and count: check the current listing guide                                | Todo   |
| Demo store       | A development store with the app installed, sample fashion and beauty products, two published bundles and the theme blocks placed (a reviewer will use it)                                                                                                                             | Todo   |
| Support email    | A monitored address (not yet chosen)                                                                                                                                                                                                                                                   | Todo   |
| Pricing          | Free plus paid plans as configured in `lib/billing/plans.ts` and `docs/12`; must match the listing text exactly                                                                                                                                                                       | Todo (verify) |
| Category, languages | Sales and conversion; English only (the widget strings are translatable through the extension locale file, but only English exists)                                                                                                                                             | Todo   |

---

# 3. Required pages

Host these on a public URL (your domain or a documentation site) and enter them in the listing. Drafts of what each must say, from what the app does:

**Privacy policy** (Todo): who is the controller and how to contact them; what is collected: the shop's domain and the shop owner's contact email, an encrypted API access token, the bundle configuration the merchant enters, product catalog copies
(titles, images, prices, availability), aggregate analytics (bundle id, event type, order reference, amount, currency, time), subscription status; **not collected:** shopper names, emails, addresses, phone numbers, IP addresses, cart contents or any shopper
identifier (the storefront events carry random ids only); purpose (operate the app); processors (hosting provider, database provider); retention (access token wiped at uninstall; all shop data deleted when Shopify sends `shop/redact`
48 hours after uninstall; analytics kept until then); shopper requests (`customers/data_request` and `customers/redact` are answered: there is no shopper data to return or erase); security measures; how to contact for deletion.

**Terms of service** (Todo): service description, plans and billing through Shopify, acceptable use, limitation of liability, termination.

**Support page** (Todo): contact email, expected response time, how to report problems (include shop domain and the time; the request id shown in error messages helps), link to documentation.

**Documentation** (Todo): installing, adding the two theme blocks (product page block; the collection with handle `bundles` for the landing page), creating a bundle from a template, customizing, publishing and deactivating, plans, uninstalling. `docs/08`, `docs/10` and `docs/15` contain the accurate details.

---

# 4. Review checklist

| Requirement                          | State                                                                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App works after install              | OAuth, session, dashboard and product sync work on the development store and are covered by tests. Re-verify on the production app in Safari (blocker 1) and with the checklist in `docs/15`                       |
| OAuth                                | HMAC, state, shop validation, encrypted token, embedded-app top-level bounce: implemented and tested. **Not live verified in production**                                                                           |
| Billing flow ready                   | Shopify Billing API with approval, lifecycle from webhooks, plan limits, cancellation; test-mode charges verified in tests; live approval **not verified** (blocker 7). Free plan works without billing                |
| Uninstall cleanup                    | `app/uninstalled`: shop inactive, token wiped, subscriptions closed, bundles deactivated, storefront stops serving; `shop/redact` erases all data. Tested with a real database                                        |
| Mandatory privacy webhooks           | **Done in this action:** `customers/data_request`, `customers/redact`, `shop/redact` declared as `compliance_topics`, HMAC verified, tested, and covered by a check that the toml declares them                          |
| Webhooks configured                  | 5 subscriptions in the toml, consistent with the code (tested). Registered only when you run `shopify app deploy`                                                                                                     |
| No broken pages                      | Dashboard pages have loading and error states; unknown routes return the standard 404. Real-browser click-through of every page is part of the live checklist (**not done**)                                          |
| Storefront performance               | The theme extension adds one script of about 8.9 KB gzipped (under a 12 KB budget) and one stylesheet, loaded deferred and initialised lazily near the viewport; no third-party requests; images lazy loaded              |
| Storefront accessibility             | axe checks pass for every widget state; keyboard operable; 44 px targets; not verified by manual screen-reader testing                                                                                             |
| Theme App Extension                  | Blocks are app blocks (no theme file editing); no `write_themes` use in code (see blocker 5)                                                                                                                         |
| Secure                               | Signed proxy, signed webhooks, CSRF header, rate limits, tenant isolation, security headers, no secrets in the repository (`docs/13`, `docs/15` section 7)                                                            |
| Data handling matches the policy     | Verified by a test that the database has no shopper personal-data columns and that the customer privacy webhooks store nothing from the payload                                                                        |

---

# 5. Submission steps (all manual, do not run before the blockers are closed)

1. Create the production app in the Partner Dashboard; note its client ID and secret.
2. Fill `shopify.app.production.toml`, set the host environment, migrate and seed the database, deploy the app (`docs/15`).
3. `shopify app deploy --config production`; install on a development store; run the live checklist.
4. Complete the listing (section 2), pages (section 3) and the data-protection declarations.
5. Submit for review from the Partner Dashboard; be ready to give reviewers the demo store and to answer within their window.
6. After approval, switch `SHOPIFY_BILLING_LIVE=true` in production and repeat the billing test with a real approval.

Distribution settings (public or custom) are chosen in the Partner Dashboard by a person; this repository does not change them.


---

# Embedded authentication (ACTION-017A update)

Blocker 1 from the original checklist ("Session-token authentication") is **substantively addressed**: every
merchant API call now authenticates with a Shopify-issued, independently-verified session token, tested against a
real database with forged, expired, wrong-shop and inactive-shop tokens, and does not depend on the session cookie
surviving a cross-site iframe. What remains, and should be confirmed before submission:

- **Live browser verification** (Safari in particular) — not done in this action, no browser automation available.
- **The initial page-shell render** still authenticates with the cookie (a structural fact of doing any
  server-rendered page inside a cross-site iframe without moving to Shopify's Token Exchange flow and fully
  client-rendered data loading — a larger, separate architectural change, out of scope here per the brief not to
  replace OAuth or redesign unrelated systems).

Re-run the install and live-testing checklist in `docs/15` section 8 once a development store and Safari are
available, specifically re-checking: dashboard loads and stays usable in Safari; every listed page (bundles,
create/edit, analytics, billing, settings, product sync, templates, customization) performs its API actions
correctly; and that reloading or navigating within the iframe does not strand the merchant on a broken page.
