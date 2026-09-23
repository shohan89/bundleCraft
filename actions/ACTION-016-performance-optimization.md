# ACTION-016 — Performance Optimization

## Objective

Optimize BundleCraft for production-level performance across:

- Merchant Dashboard
- API layer
- Database
- Storefront
- Bundle Landing Page
- Product Page Bundle Widget
- Shopify integrations

The objective is to make the application fast, lightweight, scalable, and efficient without changing the intended MVP functionality.

Performance improvements must be based on the actual implementation.

Do not introduce unnecessary complexity or infrastructure.

---

# Required Documentation To Read First

Before writing any code, Claude Code MUST read:

1. `CLAUDE.md`
2. `docs/01-PRD.md`
3. `docs/02-ARCHITECTURE.md`
4. `docs/03-TECH_STACK.md`
5. `docs/04-DATABASE_DESIGN.md`
6. `docs/05-SHOPIFY_INTEGRATION.md`
7. `docs/06-API_SPECIFICATION.md`
8. `docs/08-STOREFRONT_WIDGET.md`
9. `docs/09-BUNDLE_ENGINE.md`
10. `docs/10-MERCHANT_DASHBOARD.md`
11. `docs/11-ANALYTICS_SYSTEM.md`
12. `docs/12-BILLING_SYSTEM.md`
13. `docs/14-TESTING_STRATEGY.md`

Also inspect:

```text
actions/ACTION-001-project-initialization.md
actions/ACTION-002-database-setup.md
actions/ACTION-004-merchant-dashboard.md
actions/ACTION-005-bundle-engine.md
actions/ACTION-006-storefront-widget.md
actions/ACTION-008-analytics-system.md
actions/ACTION-012-product-sync.md
actions/ACTION-013-bundle-landing-page.md
actions/ACTION-015-theme-customization.md

Read the actual implementation before making changes.

Do not assume the application currently has the architecture described in the documentation.

Role

Act as a senior performance engineer specializing in:

Next.js
React
PostgreSQL
Prisma
Shopify storefront applications
SaaS performance optimization

Your job is to identify actual performance bottlenecks and improve them without breaking functionality.

Do not optimize blindly.

Scope

Optimize:

Next.js application performance
React rendering
JavaScript bundle size
Storefront JavaScript
API performance
Database queries
Prisma usage
Shopify API requests
Product synchronization
Bundle retrieval
Analytics writes
Image loading
Network requests
Caching where appropriate
Loading states
Error handling
Performance monitoring/readiness
1. Establish Performance Baseline

Before making optimizations, inspect and measure the current implementation.

Identify:

Build size
Client JavaScript size
Server-side bottlenecks
Slow API routes
Slow database queries
Duplicate API requests
Large components
Unnecessary client components
Large dependencies
Storefront script size
Image loading behavior

Do not optimize based only on assumptions.

Create a short baseline report.

Where practical record:

Initial build result
Initial bundle size
Initial API response characteristics
Initial storefront performance observations

Use actual measurements.

2. Next.js Rendering Strategy

Inspect the application for unnecessary client-side rendering.

Determine which components can remain server-rendered.

Avoid using:

"use client";

unless client-side behavior is actually required.

Examples of components that may need client-side behavior:

Interactive bundle builder
Color customization editor
Product selection
Live preview
Interactive dashboard controls

Static content should not become client components unnecessarily.

3. React Rendering Optimization

Inspect React components for unnecessary re-renders.

Look for:

Large parent components
Unstable props
Recreated objects/functions
Duplicate state
Unnecessary effects
Repeated calculations
Large lists

Use optimization techniques only where measurement or architecture justifies them.

Do not blindly add:

useMemo
useCallback
memo

everywhere.

4. Component Splitting

Identify large components that should be split into smaller reusable components.

Potential areas:

Bundle Builder
Product Selector
Analytics Dashboard
Template Selector
Customization Editor
Bundle Cards

Component splitting should improve maintainability and rendering behavior.

Do not split components into excessive micro-components without a reason.

5. Code Splitting

Identify functionality that does not need to load immediately.

Potential candidates:

Analytics charts
Advanced customization UI
Template previews
Large product selectors
Secondary dashboard sections

Use dynamic loading where appropriate.

Do not dynamically load critical above-the-fold UI unnecessarily.

6. JavaScript Bundle Optimization

Inspect dependencies and client-side JavaScript.

Identify:

Large dependencies
Duplicate libraries
Unused packages
Browser-only packages loaded server-side
Server-only packages accidentally bundled for clients

Remove unused dependencies only when confirmed safe.

Do not remove packages merely because they appear unused without verifying imports/build usage.

7. Dependency Audit

Inspect:

package.json
package-lock.json

and determine:

Duplicate dependencies
Unused dependencies
Heavy dependencies
Outdated dependencies that create performance/security concerns

Do not perform major dependency upgrades unless necessary for this action.

If an upgrade could cause breaking changes, document it instead of silently performing it.

8. Image Optimization

Inspect storefront and dashboard image usage.

Optimize:

Product images
Bundle images
Template preview images
Dashboard assets

Requirements:

Appropriate dimensions
Responsive loading
Lazy loading where appropriate
Avoid unnecessary full-resolution images
Prevent layout shifts

Do not lazy-load critical above-the-fold images unnecessarily.

9. Storefront JavaScript

The storefront bundle widget is particularly performance-sensitive.

Inspect:

ACTION-006-storefront-widget.md
ACTION-013-bundle-landing-page.md
ACTION-015-theme-customization.md

The storefront implementation should:

Load minimal JavaScript
Avoid unnecessary dependencies
Avoid blocking page rendering
Avoid duplicate API calls
Avoid unnecessary polling
Load analytics asynchronously where possible

Do not ship the entire merchant dashboard JavaScript bundle to the storefront.

10. Storefront Widget Isolation

Ensure the storefront widget does not accidentally import:

Dashboard components
Admin-only utilities
Prisma
Server-only code
Shopify Admin API libraries
Billing logic

The customer-facing bundle must contain only what is required for storefront functionality.

11. Bundle Landing Page Optimization

Inspect the Bundle Landing Page.

Optimize:

Initial bundle request
Product image loading
Bundle card rendering
JavaScript
CSS
API requests

Avoid:

One API request per bundle
One API request per product
One API request per variant

where the architecture can provide batched data.

12. API Performance

Inspect all important API routes.

Prioritize:

/api/bundles
/api/products
/api/analytics/*
/api/billing/*
/api/templates

Look for:

Duplicate database queries
N+1 queries
Unnecessary data selection
Large payloads
Missing pagination
Repeated authentication/database lookups

Return only the fields required by the caller.

13. Database Query Optimization

Inspect Prisma queries throughout the application.

Look for:

findMany()
findFirst()
findUnique()
include
select
orderBy

and identify inefficient patterns.

Avoid loading complete database records when only a few fields are required.

Prefer:

select

when appropriate.

14. N+1 Query Prevention

Identify N+1 query patterns.

Examples:

Get bundles
 ↓
For each bundle
 ↓
Get products

or:

Get products
 ↓
For each product
 ↓
Get variants

Where practical, replace with efficient relational queries.

Do not make queries unnecessarily complex if a simpler approach is already performant.

15. Database Index Review

Review indexes against actual query patterns.

Important areas may include:

shopId
bundle.shopId
bundle.status
bundleProduct.bundleId
bundleProduct.productId
analytics.shopId
analytics.bundleId
analytics.createdAt
product.shopId
product.shopifyProductId
variant.productId
variant.shopifyVariantId

Do not add indexes without understanding the query pattern.

Too many indexes can negatively affect writes.

Only add indexes justified by actual queries.

16. Pagination

Ensure large datasets are paginated.

Prioritize:

Products
Bundles
Analytics
Orders/events where applicable

Avoid loading thousands of records into the browser.

Use the pagination strategy already supported by the application.

17. API Payload Optimization

Reduce unnecessary API response size.

For example, a product list may not need:

Full description
Large metadata
Unused fields

when the UI only needs:

id
title
image
price
variant information

Use appropriate response DTOs or serialization.

18. Shopify API Efficiency

Inspect Shopify API usage.

Avoid:

Duplicate product requests
Repeated shop metadata requests
Repeated configuration requests
Unnecessary API calls during page rendering

Reuse data already available in the local database where appropriate.

Do not replace Shopify as the source of truth where Shopify must remain authoritative.

19. Product Sync Performance

Inspect:

ACTION-012-product-sync.md

Optimize synchronization for larger stores.

Use:

Pagination
Batch database operations
Upserts
Efficient transactions
Appropriate concurrency

Do not create uncontrolled parallel requests that could overload Shopify or the application.

20. Webhook Performance

Inspect:

ACTION-011-shopify-webhooks.md

Webhook handlers should remain lightweight.

Avoid doing expensive processing directly inside the request path when unnecessary.

Ensure:

Webhook
 ↓
Validate
 ↓
Idempotency
 ↓
Fast processing/dispatch

Do not introduce a queue system unless the existing architecture actually requires one.

21. Analytics Performance

Inspect:

ACTION-008-analytics-system.md

Analytics events should not significantly slow down storefront interactions.

Avoid blocking:

Add to Cart

because of analytics.

Review:

Database writes
Event aggregation
Query patterns
Dashboard analytics queries

Use efficient aggregation.

22. Analytics Dashboard Queries

Analytics dashboard queries should not load every raw event when summary data is sufficient.

For example:

Bundle Views
Bundle Adds
Bundle Purchases
Revenue
Conversion Rate

should be calculated efficiently.

Avoid transferring large raw datasets to the browser.

23. Caching

Identify data that can safely be cached.

Potential candidates:

Active templates
Public bundle configuration
Storefront customization
Product display data where appropriate

Do not cache:

Sensitive merchant data without tenant isolation
User-specific data incorrectly
Billing state without appropriate freshness
Data that requires immediate consistency

Caching must never cause one merchant's data to appear for another merchant.

24. Cache Invalidation

For every new cache introduced, document:

What is cached?
Who can access it?
How long does it live?
When is it invalidated?

Do not introduce a cache without an invalidation strategy.

25. Database Connection Management

Inspect Prisma/database connection usage.

Ensure:

Prisma client is reused appropriately
New database clients are not created per request unnecessarily
Development hot reload does not create uncontrolled connections
Production connection handling is appropriate

Do not create multiple Prisma clients without a documented reason.

26. Loading States

Review major UI flows for loading states.

Prioritize:

Dashboard
Bundles
Create Bundle
Product selector
Analytics
Billing
Storefront bundle loading

Loading states should provide useful feedback without causing layout shifts.

27. Error Boundaries

Inspect the application for proper error boundaries.

A failure in one dashboard section should not unnecessarily break the entire dashboard.

Storefront failures should degrade gracefully.

Do not expose stack traces to users.

28. Network Request Optimization

Inspect browser network requests.

Look for:

Duplicate requests
Sequential requests that can safely run in parallel
Unnecessary requests
Large payloads
Requests triggered repeatedly by React effects

Where safe, parallelize independent requests.

Do not parallelize requests that have dependencies.

29. Prefetching

Use prefetching only where it provides a real UX benefit.

Potential areas:

Bundle details
Product details
Dashboard navigation

Do not prefetch large datasets that the merchant may never use.

30. CSS Optimization

Inspect storefront and dashboard CSS.

Look for:

Duplicate styles
Large unused CSS
Excessive runtime styles
Unnecessary dependencies

Ensure theme customization continues to work.

Do not remove styles that are dynamically required by storefront layouts.

31. Accessibility Performance

Performance optimization must not remove:

Keyboard support
Focus states
Semantic markup
Accessible labels
Screen-reader functionality

Accessibility and performance must both remain functional.

32. Mobile Performance

Prioritize mobile storefront performance.

Inspect:

Initial JavaScript
Image sizes
Network requests
Layout shifts
Touch interactions

Avoid desktop-sized assets on mobile where responsive alternatives are available.

33. Performance Monitoring Readiness

Prepare the application for performance monitoring.

Where the existing architecture supports it, expose useful metrics such as:

API response time
Database query duration
Webhook processing duration
Product sync duration
Bundle loading time

Do not add an expensive monitoring platform unless already configured.

34. Performance Regression Tests

Where practical, add automated checks for obvious regressions.

Examples:

API response payload limits
Product pagination
Bundle query count
Storefront bundle size
Database query efficiency

Do not create fragile tests that depend on exact machine-specific timing.

35. Security During Optimization

Do not sacrifice security for performance.

Never:

Remove authentication
Disable authorization
Expose database records
Expose Shopify access tokens
Cache sensitive data incorrectly
Skip webhook verification
Bypass input validation

Performance changes must preserve the existing security model.

36. Testing

Run and/or create tests covering:

API
Bundle API
Product API
Template API
Analytics API
Database
Query correctness
Tenant isolation
Pagination
Storefront
Bundle loading
Product loading
Cart flow
Customization rendering
Webhooks
Product events
Uninstall event
Idempotency
Regression
Existing functionality remains intact
37. Performance Verification

After optimization, repeat the baseline measurements.

Compare:

Before
vs
After

Report actual measurable improvements where available.

Do not invent performance percentages.

If exact metrics cannot be measured, report qualitative observations honestly.

38. Type Safety

Maintain TypeScript type safety.

Do not introduce:

any

to bypass performance-related typing problems.

Do not disable:

TypeScript checks
ESLint rules
Build checks

just to make validation pass.

39. Documentation Updates

Update relevant documentation if the architecture changes.

Potential files:

docs/02-ARCHITECTURE.md
docs/04-DATABASE_DESIGN.md
docs/05-SHOPIFY_INTEGRATION.md
docs/08-STOREFRONT_WIDGET.md
docs/11-ANALYTICS_SYSTEM.md
docs/13-SECURITY.md
docs/14-TESTING_STRATEGY.md

Document:

Important performance decisions
New indexes
Caching strategy
Query optimization
Storefront optimization
Performance measurement results

Do not rewrite unrelated documentation.

40. Validation Commands

Run the actual project validation commands.

Attempt:

npm run lint
npm run typecheck
npm test
npm run build

If a command does not exist:

Do not invent it.
Use the actual project equivalent if available.
Report it honestly.
41. Final Verification Checklist

Before marking this action complete:

 Performance baseline captured
 Next.js rendering reviewed
 React rendering reviewed
 Component structure reviewed
 Code splitting reviewed
 JavaScript bundle reviewed
 Dependency usage reviewed
 Images optimized
 Storefront JavaScript reviewed
 Dashboard performance reviewed
 API performance reviewed
 Prisma queries reviewed
 N+1 queries addressed
 Database indexes reviewed
 Pagination verified
 API payloads optimized
 Shopify API calls reviewed
 Product sync reviewed
 Webhook performance reviewed
 Analytics performance reviewed
 Caching reviewed
 Cache invalidation documented if applicable
 Prisma connection handling reviewed
 Loading states reviewed
 Error boundaries reviewed
 Network requests reviewed
 CSS reviewed
 Mobile performance reviewed
 Security preserved
 Performance regression tests added where appropriate
 Before/after verification performed
 Documentation updated where necessary
 Lint checked
 Typecheck checked
 Tests checked
 Build checked
Important Restrictions

DO NOT implement:

New MVP features
New bundle types
New billing features
New analytics features
AI features
New external infrastructure without justification
Complex queue systems
Complex caching infrastructure
CDN migration
Database migration to a different provider
Unrelated refactoring
Breaking dependency upgrades

Do not optimize code simply for shorter source code.

Keep this action focused on:

Production Performance Optimization.

Completion Report

When finished, provide:

1. Performance Baseline

Report the actual baseline findings.

2. Optimizations Implemented

List the actual optimizations.

3. Database Optimizations

List:

Index changes
Query improvements
N+1 fixes
Pagination changes
4. Frontend Optimizations

List:

Rendering changes
Code splitting
Bundle reductions
Image improvements
Component optimizations
5. Storefront Optimizations

Explain improvements to:

Bundle Landing Page
Product Page Widget
Storefront JavaScript
6. Shopify/API Optimizations

Explain improvements to:

Shopify API usage
Product sync
Webhooks
API payloads
7. Caching

If caching was introduced, document:

What:
TTL:
Scope:
Invalidation:

If no caching was needed, state that.

8. Performance Comparison

Report actual:

Before:
After:
Improvement:

Only provide measurable values that were actually obtained.

9. Files Created

List every new file.

10. Files Modified

List every modified file.

11. Tests

List tests created/run and actual results.

12. Validation

Report actual results:

Lint:
Typecheck:
Tests:
Build:
13. Issues

List unresolved issues honestly.

Do not claim performance verification that was not actually performed.

14. Next Action

After completing this action, the next planned action is:

ACTION-017-security-hardening.md

Do not execute the next action automatically.
```
