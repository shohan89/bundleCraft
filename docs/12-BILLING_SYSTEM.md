# Billing System Architecture

## Purpose

Manage Shopify SaaS subscription plans.

---

# Pricing Plans

## Free

$0/month

Includes:

- 1 active bundle
- Basic widget
- Shopify branding

---

## Starter

$19/month

Includes:

- Unlimited bundles
- Templates
- Customization

---

## Growth

$39/month

Includes:

- Analytics
- Remove branding

---

## Pro

$79/month

Includes:

- Multiple stores
- Advanced reports

---

# Shopify Billing Flow

Merchant selects plan

↓

Create Shopify subscription

↓

Shopify approval

↓

Save subscription status

↓

Enable features

---

# Feature Limiting

System checks:

Merchant plan

↓

Available features

↓

Allow / Restrict

---

# Future Billing

Support:

- Annual plans
- Coupons
- Enterprise pricing


---

# Implementation (ACTION-009)

## Code map

- `lib/billing/plans.ts`: the only place plan names, prices, limits and features live.
- `lib/billing/feature-gates.ts`: pure checks over that config.
- `services/billing/`: `create`, `cancel`, `subscriptions` (state + Shopify sync), `access` (server-side gates), `gateway`.
- `services/shopify/billing.ts`: Shopify Billing GraphQL (create, read back, cancel).
- API: `app/api/billing/{create,current,cancel,callback}`, `app/api/webhooks/app-subscriptions-update`.
- UI: `/dashboard/billing` (`components/dashboard/billing/`), `UpgradePrompt`.

## How a plan is decided

The plan in force is the shop's `active` subscription row, or Free. A row becomes `active` only when
the server reads the subscription back from Shopify and finds status ACTIVE with the name and price
that `lib/billing/plans.ts` defines for the plan we requested. The browser return, the webhook payload
and the request body never set a plan.

```
choose plan -> POST /create -> Shopify subscription (PENDING) -> approval page
   -> callback / webhook / page load -> read back from Shopify -> verify -> ACTIVE -> features on
```

## Plans and enforcement

Prices are the documented ones (Free $0, Starter $19, Growth $39, Pro $79, USD, monthly). Tiers are
cumulative (docs list what each tier adds).

| Rule                                 | Enforced?                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| Free: 1 active bundle                | Yes, in `publishBundle` under a per-shop lock (drafts are unlimited).                       |
| Analytics needs Growth or Pro        | Yes, on `/api/analytics/*` and the Analytics/Home pages. Collection continues on all plans. |
| Templates, customization (Starter+)  | Defined in config, not enforced: the create wizard requires a template on every plan.       |
| Remove branding (Growth+)            | Defined in config, not enforced: the widget has no branding element yet.                    |
| Multiple stores, advanced reports (Pro) | Defined in config, not enforced: neither feature exists yet.                             |

## Lifecycle

- **Upgrade / paid-to-paid change:** a new subscription is created; the previous one is replaced by
  Shopify when the new one is approved, and local rows follow what Shopify reports. Which moment a
  downgrade takes effect is Shopify's decision (its default replacement behaviour); the app never simulates it.
- **Cancel / downgrade to Free:** `appSubscriptionCancel`, verified by reading back. Bundles stay active;
  the Free limit only blocks publishing more, and the dashboard says so.
- **History:** rows are never deleted; a cancelled or expired subscription stays as a record.
- **Duplicates:** creation runs under a per-shop advisory lock; a repeat request within 30 minutes
  returns the same approval page; an owned plan returns 409; a Shopify subscription id is unique.

## Test vs live charges

Charges are Shopify TEST charges unless `SHOPIFY_BILLING_LIVE=true`. Set it only in production.

## Manual steps

1. `shopify app deploy` to register the `app_subscriptions/update` webhook.
2. Set `SHOPIFY_BILLING_LIVE=true` in production.
3. Approve a test subscription on a development store to verify the flow end to end.
4. App uninstall (ACTION-011): the `app/uninstalled` webhook closes local subscriptions (`cancelled`, unapproved `expired`) and returns the shop to Free; rows are kept.


---

# Templates and plans (ACTION-014)

Unchanged: `templates` remains defined in the plan configuration but is not enforced. Every plan, including
Free, can use all five templates, because the Create Bundle wizard needs a template. Bundle limits and the
other feature gates apply to bundles made from templates exactly as to any bundle.


---

# Customization and plans (ACTION-015)

Unchanged: `customization` is defined in the plan configuration but not enforced. Every plan, including Free, can
use all customization options. No billing code was modified.
