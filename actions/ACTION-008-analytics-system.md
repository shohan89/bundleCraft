# ACTION-008 — Analytics System Implementation

## Objective

Implement the BundleCraft analytics system.

The analytics system must collect and process bundle performance events and provide merchants with useful bundle-level and store-level performance metrics.

The MVP analytics system must support:

- Bundle Views
- Bundle Adds
- Bundle Purchases
- Revenue Generated
- Conversion Rate

The implementation must integrate with:

- Storefront Widget
- Bundle Engine
- Merchant Dashboard
- Database
- Existing API architecture

Do not implement billing or subscription analytics in this action.

---

# Required Documentation To Read First

Before starting implementation, read the following files completely:

1. `CLAUDE.md`
2. `docs/01-PRD.md`
3. `docs/02-ARCHITECTURE.md`
4. `docs/04-DATABASE_DESIGN.md`
5. `docs/06-API_SPECIFICATION.md`
6. `docs/08-STOREFRONT_WIDGET.md`
7. `docs/09-BUNDLE_ENGINE.md`
8. `docs/10-MERCHANT_DASHBOARD.md`
9. `docs/11-ANALYTICS_SYSTEM.md`
10. `docs/13-SECURITY.md`
11. `tasks/phase-08-analytics/analytics-system.md`

Also inspect:

```text
ACTION-001
ACTION-002
ACTION-003
ACTION-004
ACTION-005
ACTION-006
ACTION-007

Do not duplicate existing functionality.

Role

Act as a senior full-stack analytics engineer specializing in:

Next.js
TypeScript
PostgreSQL
Prisma
Ecommerce analytics
Event tracking
Multi-tenant SaaS analytics
Shopify applications

Build the analytics system as a scalable and maintainable service.

1. Analytics Architecture

Use the following high-level flow:

Customer
   ↓
Storefront Widget
   ↓
Analytics Event
   ↓
BundleCraft API
   ↓
Analytics Validation
   ↓
Analytics Service
   ↓
PostgreSQL
   ↓
Merchant Analytics Dashboard

The storefront should only send the required event information.

The backend remains responsible for validation and persistence.

2. Supported Events

The MVP must support:

bundle_view
bundle_add
bundle_purchase

These events represent:

bundle_view
    Customer views a bundle

bundle_add
    Customer successfully adds a bundle to cart

bundle_purchase
    A bundle-associated purchase is completed

Use the terminology defined in:

docs/11-ANALYTICS_SYSTEM.md

Do not create unrelated event names.

3. Analytics Data Model

Use the existing AnalyticsEvent model defined in:

docs/04-DATABASE_DESIGN.md

Inspect the current Prisma schema before making changes.

Do not create a second analytics event table if the existing model already supports the required functionality.

If the existing schema is insufficient for a required MVP feature:

Identify the limitation.
Make the minimum necessary schema change.
Create a migration.
Document the change.

Do not silently redesign the database.

4. Event Data

Each analytics event should contain enough information to associate the event with:

Shop
Bundle
Event Type
Event Metadata
Timestamp

Where supported by the existing architecture, useful metadata may include:

Bundle ID
Bundle Type
Product/Variant IDs
Cart information
Order information
Revenue information
Currency
Session/event identifier

Only store data required by the analytics system.

Do not store unnecessary customer personal information.

5. Multi-Tenant Analytics

Analytics must be isolated by Shopify shop.

Every analytics query must be scoped to the authenticated merchant/store.

Example:

Shop A
   ↓
Analytics
   ↓
Only Shop A bundle events

Shop A must never see:

Shop B analytics

Never trust a frontend-provided shop ID.

Resolve shop identity through the authenticated application context where applicable.

6. Bundle View Event

Implement tracking for:

bundle_view

Trigger when a customer views a valid active bundle.

The event should contain the relevant bundle identifier.

Conceptual flow:

Bundle rendered
      ↓
bundle_view
      ↓
POST /api/analytics/event
      ↓
Validate event
      ↓
Store event

Do not send duplicate events unnecessarily due to repeated React renders.

The storefront implementation should trigger the event intentionally.

7. Bundle Add Event

Implement tracking for:

bundle_add

Trigger only after a bundle has been successfully added to the Shopify cart.

Do not count a failed Add to Cart attempt as a successful bundle add.

Flow:

Customer clicks Add Bundle
        ↓
Validate selection
        ↓
Shopify cart operation
        ↓
Successful cart response
        ↓
bundle_add

If the cart operation fails:

No bundle_add event
8. Bundle Purchase Event

Implement tracking for:

bundle_purchase

This event represents a completed purchase associated with a bundle.

The implementation must use the existing Shopify/order architecture.

Do not treat:

bundle_add

as:

bundle_purchase

A purchase event must only be recorded when the order/purchase condition is satisfied.

9. Purchase Tracking Source

Use the Shopify integration architecture already defined in:

docs/05-SHOPIFY_INTEGRATION.md

Inspect the existing project for appropriate Shopify order/event mechanisms.

The system should be designed so that completed order information can be associated with the relevant BundleCraft bundle.

Do not invent an unsupported Shopify webhook or API flow.

If the existing documentation does not specify the exact purchase-event mechanism, implement the analytics service boundary and document what remains to be configured.

Do not falsely claim that live Shopify purchase attribution has been verified.

10. Analytics Event API

Implement the analytics event API described in:

docs/06-API-SPECIFICATION.md

At minimum:

POST /api/analytics/event

The endpoint should:

Receive an analytics event.
Validate the request.
Resolve the appropriate shop context.
Validate bundle ownership where applicable.
Validate event type.
Store the event.
Return a consistent response.
11. Event Validation

Only allow supported event types:

bundle_view
bundle_add
bundle_purchase

Reject unknown event types.

Validate:

Bundle ID
Event type
Event metadata
Timestamp where applicable
Revenue data for purchase events

Do not blindly trust client-provided revenue values.

Where authoritative Shopify order data is available, use the trusted server-side source.

12. Duplicate Event Protection

Design the system to reduce accidental duplicate events.

Examples:

Repeated component render
Repeated network request
Browser retry
User double-click
Webhook retry

Where appropriate, support an event identifier/idempotency key.

If the current database architecture does not include such a field:

Inspect whether one is required for the MVP.
Add the minimum necessary field only if justified.
Document the decision.

Do not create unnecessary complexity.

13. Revenue Tracking

Track:

Revenue Generated

for bundle purchases.

Revenue should be associated with the correct bundle where attribution is available.

Do not count:

Bundle Views
Bundle Adds

as revenue.

Only completed purchase events should contribute to purchase revenue.

14. Currency

Where purchase revenue is stored, preserve the currency information when available.

Do not convert currencies unless the existing project explicitly supports a currency conversion system.

For MVP:

Store the authoritative transaction currency.

Do not invent exchange rates.

15. Conversion Rate

The analytics documentation defines:

Conversion Rate =
Bundle Purchases / Bundle Views × 100

Implement the calculation according to:

docs/11-ANALYTICS_SYSTEM.md

Handle:

Views = 0

without producing:

NaN
Infinity

Return an appropriate zero/empty representation according to the existing API design.

16. Store Analytics Overview

Implement the analytics overview required by the merchant dashboard.

The overview should provide:

Total Bundle Views
Total Bundle Adds
Total Bundle Purchases
Total Revenue Generated
Conversion Rate

Conceptual API:

GET /api/analytics/overview

Scope the results to the authenticated shop.

17. Bundle-Level Analytics

Implement bundle-specific analytics.

Conceptual API:

GET /api/analytics/bundle/:id

The response should include:

Bundle Views
Bundle Adds
Bundle Purchases
Revenue Generated
Conversion Rate

Verify that the requested bundle belongs to the authenticated shop.

18. Date Filtering

Provide an analytics architecture that can support date filtering.

Where the existing API specification supports it, allow parameters such as:

startDate
endDate

Example:

/api/analytics/overview?startDate=...&endDate=...

Validate date values.

Do not allow invalid ranges.

If date filtering is not explicitly required by the current API documentation, implement the service in a way that can support it later without unnecessarily changing the public API.

19. Bundle Filtering

Where supported by the analytics dashboard architecture, allow analytics to be filtered by bundle.

Example:

Bundle:
All Bundles

or:

Bundle:
Complete Look

The filtering must always remain scoped to the authenticated shop.

20. Analytics Service Layer

Keep analytics business logic outside the API route.

Suggested conceptual structure:

lib/
└── analytics/
    ├── analytics.service.ts
    ├── analytics.validation.ts
    ├── analytics.types.ts
    └── analytics.errors.ts

The architecture should follow:

API Route
    ↓
Authentication
    ↓
Analytics Service
    ↓
Prisma
    ↓
PostgreSQL

Do not place aggregation logic directly inside React components.

21. Analytics Queries

Use efficient database queries.

Avoid loading every raw event into application memory just to calculate totals.

Prefer database-level aggregation where practical.

Examples:

COUNT
SUM
GROUP BY
Date filtering
Bundle filtering

Avoid N+1 queries.

Use existing database indexes.

22. Database Indexes

Review the indexes defined in:

docs/04-DATABASE_DESIGN.md

Analytics queries will commonly filter by:

shopId
bundleId
eventType
createdAt

Use existing indexes where appropriate.

If a missing index becomes a clear performance requirement:

Document the reason.
Add the minimum necessary index.
Create a migration.

Do not add speculative indexes.

23. Merchant Dashboard Integration

Integrate analytics with:

/dashboard
/dashboard/analytics

The dashboard should consume the analytics APIs.

The Home dashboard should display summary metrics.

The Analytics page should display detailed metrics.

Do not calculate analytics entirely in the browser from raw events.

24. Dashboard Analytics Cards

Support the existing dashboard metrics:

Bundle Views
Bundle Adds
Bundle Purchases
Revenue Generated
Conversion Rate

Use reusable dashboard components created in:

ACTION-004

Do not duplicate the dashboard component system.

25. Analytics Loading States

Implement proper loading states for analytics.

Examples:

Skeleton
Loading indicator
Empty state

Do not display misleading zero values while data is still loading unless that is the established UI behavior.

26. Analytics Empty State

If a merchant has no analytics data, display an appropriate empty state.

Example concept:

No bundle activity yet.

Create and publish a bundle to start collecting performance data.

Do not display fake analytics data.

27. Analytics Error Handling

Handle:

Database failure
API failure
Invalid bundle
Unauthorized access
Invalid date range
Invalid event
Shopify attribution failure

Return safe and consistent errors.

Do not expose database errors or stack traces.

28. Analytics Privacy

Only collect data necessary for bundle analytics.

Do not unnecessarily store:

Customer names
Customer email addresses
Phone numbers
Full addresses
Payment details
Sensitive personal information

If an identifier is required for technical attribution, use the minimum necessary non-sensitive identifier supported by the architecture.

29. Security

Analytics endpoints must:

Validate authentication where merchant data is requested.
Validate shop ownership.
Validate bundle ownership.
Validate event type.
Validate incoming payload.
Prevent cross-shop data access.
Avoid exposing internal database information.

Never allow:

GET /api/analytics/overview?shopId=another-shop

to bypass merchant isolation.

30. Event Endpoint Abuse Protection

The event endpoint may be publicly reachable from the storefront.

Design it to reduce abuse.

Consider:

Payload validation
Rate limiting where supported
Strict event types
Bundle validation
Reasonable payload limits

Do not add a complex infrastructure system unless the existing architecture supports it.

31. Analytics Client

Create a small client/service abstraction for storefront analytics.

Example conceptual structure:

lib/
└── analytics/
    └── analytics.client.ts

It should provide simple methods such as:

trackBundleView(...)
trackBundleAdd(...)
trackBundlePurchase(...)

The storefront should not manually construct raw API requests throughout multiple components.

32. Storefront Integration

Inspect:

ACTION-006 — Storefront Widget

Integrate the analytics client into the storefront where appropriate.

Required events:

bundle_view
bundle_add
bundle_purchase

At minimum:

bundle_view
bundle_add

must be connected to the storefront implementation.

Purchase tracking should use the appropriate completed-purchase mechanism.

33. Bundle View Deduplication

Avoid triggering multiple bundle_view events simply because:

A component re-rendered.
State changed.
A modal opened/closed.
React development behavior caused duplicate execution.

Track the view intentionally.

Do not over-count views due to frontend implementation details.

34. Bundle Add Attribution

A bundle_add event should be tied to the bundle being added.

Where the storefront creates a bundle instance identifier, preserve that identifier through the relevant cart flow where supported.

This helps later connect:

Bundle View
    ↓
Bundle Add
    ↓
Bundle Purchase

Do not create unrelated identifiers in each system.

35. Purchase Attribution

Design purchase analytics so the system can associate a completed order with a BundleCraft bundle.

Potential attribution information may include:

Bundle ID
Bundle Instance ID
Order ID
Revenue
Currency

Only use information supported by the existing Shopify integration.

Do not claim perfect attribution if Shopify/cart behavior prevents it.

36. Revenue Calculation

For bundle purchases:

Revenue Generated

must use authoritative purchase/order information when available.

Do not calculate revenue from:

Product price × frontend quantity

if authoritative Shopify order data is available.

Avoid double-counting orders.

37. Analytics Data Consistency

The system should maintain consistent relationships:

Shop
 ↓
Bundle
 ↓
Analytics Events

An analytics event referencing a bundle must not point to a bundle belonging to another shop.

38. Testing

Create tests for:

Event Creation
Valid bundle_view
Valid bundle_add
Valid bundle_purchase
Invalid event type
Invalid bundle
Unauthorized event where applicable
Aggregation
View count
Add count
Purchase count
Revenue sum
Conversion rate
Bundle Analytics
Correct bundle totals
Cross-shop bundle blocked
Overview Analytics
Correct store totals
Empty store handled
Conversion Rate

Test:

100 views
10 purchases

Expected:

10%

Also test:

0 views
0 purchases

and confirm there is no division error.

Security
Shop A cannot access Shop B analytics.
Shop A cannot access Shop B bundle analytics.
39. Event Tracking Tests

Test storefront event behavior where practical:

Bundle rendered
    ↓
Exactly one intended bundle_view event

and:

Successful cart add
    ↓
bundle_add event

while:

Failed cart add
    ↓
No bundle_add event
40. Duplicate Event Tests

Test repeated requests where idempotency is supported.

Examples:

Same event sent twice
Same purchase notification retried
Same browser action retried

Verify that the analytics system does not unnecessarily inflate metrics.

41. Performance Testing

Verify that:

Analytics queries use database aggregation.
Large event datasets do not require loading all events into memory.
Dashboard requests remain reasonably efficient.
Storefront tracking does not block bundle interaction.
Analytics failures do not prevent customers from adding bundles to cart.

Analytics tracking should be non-blocking where practical.

42. Failure Isolation

Analytics must not break the core bundle experience.

If analytics tracking fails:

Customer should still be able to use the bundle.

For example:

bundle_add
   ↓
Cart succeeds
   ↓
Analytics request fails
   ↓
Customer still has successful cart operation

Do not make analytics a hard dependency for storefront functionality.

43. Do NOT Implement In This Action

Do NOT implement:

Billing analytics
Subscription analytics
Advanced customer analytics
Cohort analytics
Customer lifetime value
AI analytics
Predictive analytics
Marketing attribution platform
External analytics integrations
Google Analytics replacement
Meta Ads attribution system

These are outside the MVP analytics scope.

44. Expected Files

The exact structure depends on the current project.

Potential structure:

lib/
└── analytics/
    ├── analytics.service.ts
    ├── analytics.validation.ts
    ├── analytics.types.ts
    ├── analytics.errors.ts
    └── analytics.client.ts

app/
└── api/
    └── analytics/
        ├── event/
        │   └── route.ts
        ├── overview/
        │   └── route.ts
        └── bundle/
            └── [id]/
                └── route.ts

Adapt this to the existing project structure.

Do not create duplicate API systems.

45. Implementation Rules

Before modifying code:

Inspect the current repository.
Read all required documentation.
Inspect the Prisma schema.
Inspect existing AnalyticsEvent model.
Inspect Bundle Engine.
Inspect Storefront Widget.
Inspect Merchant Dashboard.
Inspect authentication/session handling.
Inspect existing API utilities.
Reuse existing infrastructure.

Do not rewrite unrelated functionality.

46. TypeScript Requirements

Use strict TypeScript.

Avoid:

any

unless absolutely necessary.

Create explicit types for:

AnalyticsEventType
AnalyticsEventInput
AnalyticsEvent
AnalyticsOverview
BundleAnalytics
RevenueMetrics
ConversionMetrics
AnalyticsFilters

Keep API and frontend types consistent.

47. Security Checklist

Before completion verify:

 Shop identity is trusted from the correct application context.
 Cross-shop analytics access is blocked.
 Bundle ownership is validated.
 Event types are validated.
 Revenue data is not blindly trusted.
 No sensitive customer data is unnecessarily stored.
 No secrets are exposed.
 Errors do not expose internal details.
48. Validation Checklist

Before completing this action:

Events
 bundle_view supported
 bundle_add supported
 bundle_purchase supported
Metrics
 Bundle Views
 Bundle Adds
 Bundle Purchases
 Revenue Generated
 Conversion Rate
APIs
 Analytics event endpoint works
 Overview endpoint works
 Bundle analytics endpoint works
Dashboard
 Home metrics connected
 Analytics page connected
 Loading state works
 Empty state works
 Error state works
Security
 Multi-tenant isolation works
 Cross-shop access blocked
 Bundle ownership checked
Performance
 Database aggregation used
 No unnecessary raw-event loading
 Analytics failures do not block storefront actions
Testing
 Unit tests pass
 Integration tests pass where available
 TypeScript passes
 Lint passes
 Build passes
49. Final Verification Commands

Run only commands that actually exist in the project.

Possible commands:

npm run lint
npm run typecheck
npm test
npm run build

If Prisma commands are part of the existing workflow, run the appropriate existing Prisma validation/generation commands.

Do not invent commands.

50. Completion Report

After implementation, provide a concise report containing:

Summary

Explain what was implemented.

Events

Confirm:

bundle_view
bundle_add
bundle_purchase
Metrics

Confirm:

Bundle Views
Bundle Adds
Bundle Purchases
Revenue Generated
Conversion Rate
APIs

List all analytics endpoints implemented.

Database

Explain:

Existing AnalyticsEvent model usage
Any schema changes
Any migrations
Dashboard

Explain how analytics was connected to:

/dashboard
/dashboard/analytics
Storefront

Explain how analytics events were connected to the storefront.

Security

Explain merchant/shop isolation.

Testing

Report:

Unit tests
Integration tests
TypeScript
Lint
Build
Limitations

Clearly document any purchase-attribution or live Shopify limitations that could not be verified.

Do not claim live Shopify purchase tracking was verified unless it was actually tested.

Next Action

The next implementation phase is:

ACTION-009 — Billing System

Do not start ACTION-009 automatically.

Wait for explicit instruction before implementing the next action.
```
