# ACTION-009 — Billing System Implementation

## Objective

Implement the BundleCraft merchant billing and subscription system.

The billing system must allow merchants to:

- View available pricing plans
- Select a plan
- Start a Shopify subscription
- Track subscription status
- Handle plan changes
- Handle cancellation
- Enforce plan-based feature access
- Display current billing status

The MVP pricing structure defined in the project documentation is:

- Free
- Starter
- Growth
- Pro

The implementation must use Shopify's billing/subscription architecture defined in the existing project documentation.

Do not implement unrelated payment systems.

---

# Required Documentation To Read First

Before starting implementation, read the following files completely:

1. `CLAUDE.md`
2. `docs/01-PRD.md`
3. `docs/02-ARCHITECTURE.md`
4. `docs/03-TECH_STACK.md`
5. `docs/04-DATABASE_DESIGN.md`
6. `docs/05-SHOPIFY_INTEGRATION.md`
7. `docs/06-API_SPECIFICATION.md`
8. `docs/07-AUTHENTICATION.md`
9. `docs/10-MERCHANT_DASHBOARD.md`
10. `docs/12-BILLING_SYSTEM.md`
11. `docs/13-SECURITY.md`
12. `tasks/phase-09-billing/billing-system.md`

Also inspect:

```text
ACTION-001
ACTION-002
ACTION-003
ACTION-004
ACTION-005
ACTION-006
ACTION-007
ACTION-008

Do not duplicate existing functionality.

Role

Act as a senior Shopify SaaS billing engineer specializing in:

Shopify Billing
Shopify App development
Subscription lifecycle management
Next.js
TypeScript
Prisma
PostgreSQL
Multi-tenant SaaS applications
Feature gating

Build the billing system as a secure and maintainable SaaS billing layer.

1. Billing Architecture

Use the following high-level architecture:

Merchant
   ↓
BundleCraft Dashboard
   ↓
Billing API
   ↓
Shopify Billing
   ↓
Subscription
   ↓
BundleCraft Subscription Record
   ↓
Feature Access

Shopify remains responsible for the merchant's Shopify app subscription billing.

BundleCraft should maintain the application-level subscription state required for feature access and dashboard display.

2. Pricing Plans

The MVP supports:

Free
Starter
Growth
Pro

The exact pricing and feature limits must follow the existing PRD and billing documentation.

Do not invent new pricing values or plan benefits if they are not defined in the project documentation.

If a pricing value is missing from the documentation:

Keep it configurable.
Do not hardcode an invented price.
Clearly report the missing configuration.
3. Subscription Model

Use the existing:

Subscription

model defined in:

docs/04-DATABASE_DESIGN.md

Inspect the current Prisma schema before modifying it.

The subscription record should maintain the relationship between:

Shop
   ↓
Subscription
   ↓
Plan
   ↓
Shopify Subscription Reference

Do not create a second subscription model if the existing model already supports the requirement.

4. Subscription Information

The application should be able to determine:

Current Plan
Subscription Status
Shopify Subscription ID
Billing Start
Billing End where applicable
Plan Limits
Plan Features

Use the minimum information required by the existing architecture.

Do not store unnecessary payment information.

5. Subscription Status

Support the subscription lifecycle required by the existing billing documentation.

At minimum account for states such as:

Pending
Active
Cancelled
Expired

Use the exact status terminology already established in the project if it differs.

Do not create multiple conflicting status systems.

6. Billing Page

Implement the merchant billing interface within the dashboard.

The billing page should allow merchants to:

View current plan
View available plans
Compare plan features
Upgrade
Downgrade where supported
Cancel where supported
View subscription status

Use the existing dashboard shell created in:

ACTION-004

Do not create a separate dashboard layout.

7. Billing Route

If the existing dashboard architecture does not already contain a billing route, create an appropriate route.

Possible route:

/dashboard/billing

Follow the project's existing route conventions.

Do not create duplicate billing pages.

8. Pricing Plan Cards

Create reusable pricing plan cards.

Each card should display:

Plan Name
Price
Billing Frequency
Features
Usage Limits
Current Plan State
Action Button

Example structure:

Starter

$X / month

✓ Feature
✓ Feature
✓ Feature

[ Choose Starter ]

Do not invent pricing values.

Use configuration-driven plan data.

9. Plan Configuration

Do not hardcode plan information throughout React components.

Create a centralized plan configuration.

Conceptual structure:

const plans = {
  free: {
    name: "Free",
    ...
  },
  starter: {
    name: "Starter",
    ...
  },
  growth: {
    name: "Growth",
    ...
  },
  pro: {
    name: "Pro",
    ...
  }
}

The actual structure should follow the existing codebase.

10. Feature Gating

The billing system must support plan-based feature access.

Conceptual flow:

Merchant Request
      ↓
Current Subscription
      ↓
Current Plan
      ↓
Feature Access Check
      ↓
Allow / Deny

Examples of feature checks may include:

Maximum bundles
Analytics access
Advanced bundle features
Customization features
Future premium functionality

Only implement feature limits explicitly defined by the existing project documentation.

Do not invent arbitrary restrictions.

11. Feature Access Service

Create a reusable billing/plan service.

Conceptual structure:

lib/
└── billing/
    ├── billing.service.ts
    ├── plans.ts
    ├── feature-gates.ts
    ├── billing.types.ts
    └── billing.errors.ts

Possible interface:

canUseFeature(shopId, feature)

or:

assertFeatureAccess(shopContext, feature)

Use the existing project architecture where possible.

12. Bundle Limit Enforcement

If the project documentation defines bundle limits per plan, enforce them in the backend.

For example:

Create Bundle
    ↓
Check current plan
    ↓
Check bundle limit
    ↓
Allow / Reject

Do not rely only on frontend UI restrictions.

Backend enforcement is authoritative.

If the merchant reaches the plan limit, return a structured error.

Example:

{
  "success": false,
  "error": {
    "code": "PLAN_LIMIT_REACHED",
    "message": "Your current plan has reached its bundle limit."
  }
}

Use the project's existing API error format if already established.

13. Shopify Billing Flow

Implement the Shopify billing flow according to:

docs/05-SHOPIFY_INTEGRATION.md
docs/12-BILLING_SYSTEM.md

High-level flow:

Merchant selects plan
        ↓
Backend validates plan
        ↓
Create Shopify subscription
        ↓
Shopify approval flow
        ↓
Merchant approves
        ↓
Subscription becomes active
        ↓
Save subscription state
        ↓
Apply plan features

Do not process the subscription entirely on the client.

14. Create Billing API

Use the existing API specification.

The project documentation includes:

POST /api/billing/create

Implement or complete the endpoint according to the existing API conventions.

The endpoint should:

Authenticate merchant.
Resolve shop.
Validate requested plan.
Check whether a subscription already exists.
Create the appropriate Shopify billing/subscription request.
Return the required approval/navigation information.
Avoid exposing sensitive credentials.
15. Billing Approval Flow

When Shopify requires merchant approval:

BundleCraft
    ↓
Shopify billing approval
    ↓
Merchant approves
    ↓
Return to BundleCraft
    ↓
Subscription state synchronized

The implementation must correctly handle:

Approval
Rejection
Cancellation
Failed billing creation

Do not mark a subscription as active before the required Shopify approval has actually occurred.

16. Subscription Synchronization

After a successful Shopify billing operation, synchronize the application's subscription record.

Conceptual flow:

Shopify Subscription
        ↓
Read/validate status
        ↓
BundleCraft Subscription
        ↓
Update local state

The local database must not blindly trust arbitrary client-side subscription status.

17. Current Plan

Implement a reliable method to retrieve the merchant's current plan.

Example conceptual API:

GET /api/billing/current

If this endpoint is not explicitly defined in the current API documentation, follow the project's existing API conventions.

The response should include:

Current plan
Subscription status
Relevant plan limits
Relevant feature access
18. Upgrade Flow

Implement plan upgrade handling.

Flow:

Current Plan
    ↓
Merchant chooses higher plan
    ↓
Validate requested plan
    ↓
Create/update Shopify billing
    ↓
Merchant approval where required
    ↓
Subscription synchronized
    ↓
New plan activated

Do not activate the higher plan before the required billing state is confirmed.

19. Downgrade Flow

If downgrades are supported by the existing billing architecture:

Current Plan
    ↓
Merchant chooses lower plan
    ↓
Validate request
    ↓
Handle Shopify billing lifecycle
    ↓
Synchronize local subscription

If immediate downgrade is not supported by the current architecture:

Follow the documented Shopify billing lifecycle.
Do not simulate a downgrade locally.
Clearly document the behavior.
20. Cancellation Flow

Provide a merchant-facing cancellation flow where supported.

The merchant should receive clear information before cancellation.

Conceptual flow:

Merchant clicks Cancel
        ↓
Confirmation
        ↓
Billing cancellation
        ↓
Subscription state updated
        ↓
Feature access updated

Do not delete historical subscription information.

Maintain the record for application history and audit purposes.

21. Free Plan

If the application supports a Free plan as defined by the PRD:

A merchant should be able to operate under the Free plan.
The system should recognize Free as a valid plan.
Free plan access should be controlled by the same plan configuration system.
No paid Shopify subscription should be created for a plan that is explicitly free.

Do not invent Free plan limits.

Use the documented configuration.

22. Subscription Webhooks / Synchronization

Inspect the existing Shopify integration architecture for subscription lifecycle events.

If the project requires webhook-based synchronization, implement the required handler using the existing webhook architecture.

Potential lifecycle events may include:

Subscription activated
Subscription updated
Subscription cancelled
Subscription expired

Only implement events supported by the project's Shopify configuration.

Do not invent unsupported webhook topics.

23. Idempotency

Billing operations must be safe to retry.

Avoid creating duplicate subscriptions when:

Merchant double-clicks
Network request retries
Browser refreshes
Shopify callback retries
Webhook retries

Before creating a new subscription:

Check existing subscription state.

Use Shopify identifiers where available.

24. Billing Error Handling

Handle errors such as:

PLAN_NOT_FOUND
INVALID_PLAN
SUBSCRIPTION_ALREADY_ACTIVE
BILLING_CREATION_FAILED
BILLING_APPROVAL_REQUIRED
SUBSCRIPTION_NOT_FOUND
SUBSCRIPTION_CANCEL_FAILED
PLAN_LIMIT_REACHED
UNAUTHORIZED
FORBIDDEN
SHOPIFY_API_ERROR

Return safe structured errors.

Never expose:

Shopify access tokens
API credentials
Database credentials
Internal stack traces
Sensitive Shopify responses
25. Multi-Tenant Billing Security

Billing data must be isolated per shop.

Example:

Shop A
   ↓
Subscription A
   ↓
Plan A

Shop A must never be able to:

View Shop B subscription
Modify Shop B subscription
Cancel Shop B subscription
Change Shop B plan

Always resolve the shop from the authenticated session.

Never trust a frontend-provided shopId.

26. Authorization

Merchant billing operations must require authenticated merchant context.

Protect:

Create subscription
Upgrade
Downgrade
Cancel
View current subscription
View billing details

Do not allow anonymous users to manipulate billing.

27. Billing Data Privacy

Do not store:

Credit card numbers
CVV
Payment credentials
Full payment instrument details

Shopify handles merchant billing/payment processing.

BundleCraft should store only the subscription information required for application functionality.

28. Dashboard Integration

Connect billing to the existing dashboard.

Potential locations:

/dashboard/billing

and potentially:

/dashboard/settings

depending on the existing dashboard architecture.

Do not redesign the entire dashboard.

29. Current Plan Indicator

Display the current plan in the merchant dashboard where appropriate.

Example:

Current Plan

Growth

[ Manage Billing ]

Use the actual subscription state from the backend.

Do not determine the current plan solely from frontend state.

30. Upgrade Prompts

When a merchant reaches a plan limitation, provide a useful upgrade prompt.

Example:

You've reached the bundle limit for your current plan.

Upgrade your plan to create more bundles.

Provide a link/action to the billing page.

Do not block access without explaining why.

31. Billing Loading States

Implement loading states for:

Current subscription
Pricing plans
Billing creation
Plan change
Cancellation

Disable relevant action buttons while an operation is in progress.

Prevent accidental duplicate billing requests.

32. Billing Empty/Error States

Handle:

No subscription
Billing API unavailable
Shopify billing unavailable
Subscription synchronization failure

Provide clear merchant-friendly messaging.

Do not expose raw Shopify API errors.

33. Database Changes

Inspect the existing Prisma Subscription model.

Only modify the schema if necessary.

Potential fields may include:

id
shopId
plan
status
shopifySubscriptionId
createdAt
updatedAt

Use the existing schema if these fields already exist.

Do not create duplicate subscription records for the same active Shopify subscription.

34. Billing Service Layer

Keep billing logic separate from React components and API routes.

Suggested architecture:

lib/
└── billing/
    ├── billing.service.ts
    ├── plans.ts
    ├── feature-gates.ts
    ├── billing.types.ts
    └── billing.errors.ts

Possible responsibilities:

billing.service.ts
    Create subscription
    Get current subscription
    Update subscription
    Cancel subscription
    Synchronize subscription

plans.ts
    Plan definitions

feature-gates.ts
    Feature access rules

billing.types.ts
    Type definitions

billing.errors.ts
    Billing-specific errors

Adapt to the existing architecture.

35. API Endpoints

At minimum support the billing API described in:

docs/06-API-SPECIFICATION.md

Required endpoint:

POST /api/billing/create

Additional endpoints may include:

GET    /api/billing/current
POST   /api/billing/change
POST   /api/billing/cancel

Only create endpoints that are actually required.

Follow the existing API conventions.

36. API Response Format

Use the project's existing API response format.

Conceptual success response:

{
  "success": true,
  "data": {
    "plan": "growth",
    "status": "active"
  }
}

Conceptual error response:

{
  "success": false,
  "error": {
    "code": "PLAN_LIMIT_REACHED",
    "message": "Your current plan does not support this action."
  }
}

Do not expose sensitive Shopify billing responses.

37. Feature Access Enforcement

Integrate billing feature checks with existing backend services.

Potential integration points include:

Bundle creation
Advanced customization
Analytics
Future premium features

Only enforce features that are defined by the current documentation.

For example:

Bundle creation
    ↓
Check plan limit
    ↓
Bundle Service

The backend must remain authoritative.

38. Analytics Integration

Do not mix subscription billing analytics with the Bundle Analytics system created in:

ACTION-008

Bundle analytics should remain focused on:

Bundle Views
Bundle Adds
Bundle Purchases
Revenue
Conversion Rate

Billing should remain focused on:

Plan
Subscription
Billing status
Feature access
39. Testing

Create tests for:

Plan Configuration
All configured plans load correctly.
Unknown plan is rejected.
Plan features are correctly resolved.
Subscription
Current subscription retrieval.
New subscription creation.
Existing active subscription detection.
Subscription synchronization.
Cancellation.
Plan change.
Feature Gating
Feature allowed on eligible plan.
Feature denied when plan limit is reached.
Backend enforcement works.
Security
Shop A cannot access Shop B subscription.
Shop A cannot modify Shop B subscription.
Anonymous billing requests are rejected.
Idempotency
Repeated subscription request does not create uncontrolled duplicates.
Repeated cancellation does not corrupt state.
Callback/webhook retry is handled safely where applicable.
40. Billing UI Tests

Test:

Billing page renders.
Current plan renders.
Pricing cards render.
Upgrade action works.
Cancellation confirmation works.
Loading states work.
Error states work.
Current plan is correctly highlighted.
41. Do NOT Implement In This Action

Do NOT implement:

Credit card processing
Stripe billing
PayPal
External payment gateway
Customer billing
Product checkout payments
Bundle discount logic
Storefront widget
Analytics engine
AI features
B2B billing
Wholesale billing
Multi-currency billing unless already defined in the current MVP documentation

Shopify remains the billing provider for the app subscription.

42. Expected Files

The exact structure depends on the existing project.

Potential structure:

lib/
└── billing/
    ├── billing.service.ts
    ├── plans.ts
    ├── feature-gates.ts
    ├── billing.types.ts
    └── billing.errors.ts

app/
├── dashboard/
│   └── billing/
│       └── page.tsx
│
└── api/
    └── billing/
        ├── create/
        │   └── route.ts
        ├── current/
        │   └── route.ts
        ├── change/
        │   └── route.ts
        └── cancel/
            └── route.ts

If webhook synchronization is required by the existing architecture:

app/
└── api/
    └── webhooks/
        └── ...

Use the existing webhook structure.

Do not create duplicate webhook systems.

43. Implementation Rules

Before modifying code:

Inspect the current repository.
Read all required documentation.
Inspect the Prisma schema.
Inspect the existing Subscription model.
Inspect Shopify authentication.
Inspect Shopify API utilities.
Inspect dashboard architecture.
Inspect existing API response/error utilities.
Inspect existing environment configuration.
Reuse existing infrastructure.

Do not rewrite unrelated code.

44. TypeScript Requirements

Use strict TypeScript.

Avoid:

any

unless absolutely necessary.

Create explicit types for:

Plan
PlanFeature
SubscriptionStatus
Subscription
BillingRequest
BillingResponse
BillingError
FeatureAccess

Keep backend and frontend billing types consistent.

45. Security Checklist

Before completion verify:

 Billing routes require authentication.
 Shop identity comes from authenticated context.
 Cross-shop billing access is blocked.
 Shopify access tokens remain server-side.
 Payment information is not stored.
 Sensitive Shopify billing responses are not exposed.
 Duplicate subscriptions are prevented.
 Feature access is enforced server-side.
 Secrets are not committed.
46. Validation Checklist

Before completing this action:

Plans
 Free plan supported where documented
 Starter plan supported
 Growth plan supported
 Pro plan supported
 Plan configuration is centralized
Subscription
 Current subscription works
 Create subscription works
 Subscription synchronization works
 Upgrade/change works where supported
 Cancellation works where supported
Feature Access
 Feature gates work
 Backend enforcement works
 Plan limits are enforced where documented
Dashboard
 Billing page works
 Current plan displays
 Pricing cards display
 Upgrade action works
 Cancellation UI works
 Loading states work
 Error states work
Security
 Authentication required
 Multi-tenant isolation works
 Payment information is not stored
 Tokens remain private
Testing
 Unit tests pass
 Integration tests pass where available
 UI tests pass where configured
 TypeScript passes
 Lint passes
 Build passes
47. Final Verification Commands

Run only commands that actually exist in the project.

Possible commands:

npm run lint
npm run typecheck
npm test
npm run build

If Prisma or Shopify-specific validation commands are part of the project, run the appropriate existing commands.

Do not invent commands.

48. Completion Report

After implementation, provide a concise report containing:

Summary

Explain what was implemented.

Plans

List the supported plans.

Billing APIs

List the implemented billing endpoints.

Subscription

Explain:

Creation
Synchronization
Status handling
Cancellation
Plan changes
Feature Gating

Explain how plan-based feature access works.

Database

List:

Prisma changes
Migrations
Subscription fields used

If no schema changes were required, explicitly state that.

Security

Explain:

Authentication
Merchant isolation
Token protection
Payment data handling
Testing

Report:

Unit tests
Integration tests
UI tests
TypeScript
Lint
Build
Limitations

Clearly document anything that could not be verified because a live Shopify billing environment or merchant approval flow was unavailable.

Do not claim that a live billing transaction was verified unless it was actually tested.

Next Action

The next implementation phase is:

ACTION-010 — Testing & Production Readiness

Do not start ACTION-010 automatically.

Wait for explicit instruction before implementing the next action.
```
