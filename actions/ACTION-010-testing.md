# ACTION-010 — Testing & Production Readiness

## Objective

Perform comprehensive testing and production-readiness validation for the BundleCraft Shopify SaaS application.

This action validates the complete MVP implementation created by:

```text
ACTION-001 — Project Initialization
ACTION-002 — Database Setup
ACTION-003 — Shopify Authentication
ACTION-004 — Merchant Dashboard
ACTION-005 — Bundle Engine
ACTION-006 — Storefront Widget
ACTION-007 — Discount Function
ACTION-008 — Analytics System
ACTION-009 — Billing System

The goal is to identify:

Functional bugs
Integration issues
Security issues
Multi-tenant isolation problems
TypeScript errors
Database issues
Shopify integration issues
Storefront issues
Billing issues
Performance problems
Production configuration issues

Do not introduce new MVP features in this action.

This action is for testing, validation, bug fixing, and production readiness.

Required Documentation To Read First

Before starting, read the following files completely:

CLAUDE.md
docs/01-PRD.md
docs/02-ARCHITECTURE.md
docs/03-TECH_STACK.md
docs/04-DATABASE_DESIGN.md
docs/05-SHOPIFY_INTEGRATION.md
docs/06-API_SPECIFICATION.md
docs/07-AUTHENTICATION.md
docs/08-STOREFRONT_WIDGET.md
docs/09-BUNDLE_ENGINE.md
docs/10-MERCHANT_DASHBOARD.md
docs/11-ANALYTICS_SYSTEM.md
docs/12-BILLING_SYSTEM.md
docs/13-SECURITY.md
docs/14-TESTING_STRATEGY.md

Also inspect:

tasks/phase-10-testing/testing-strategy.md

And review all implementation work from:

ACTION-001
ACTION-002
ACTION-003
ACTION-004
ACTION-005
ACTION-006
ACTION-007
ACTION-008
ACTION-009
Role

Act as a senior QA engineer, security engineer, and production-readiness engineer specializing in:

Shopify SaaS applications
Next.js
TypeScript
PostgreSQL
Prisma
Shopify APIs
Shopify Functions
Theme App Extensions
Ecommerce systems
Multi-tenant SaaS
Production deployment

Do not only test whether the application builds.

Validate the complete user and merchant workflows.

1. Testing Strategy

Use multiple testing levels:

Unit Tests
    ↓
Integration Tests
    ↓
API Tests
    ↓
UI Tests
    ↓
End-to-End Tests
    ↓
Shopify Integration Tests
    ↓
Security Tests
    ↓
Performance Checks
    ↓
Production Readiness

Use the testing tools already configured in the project.

Do not replace the existing testing framework without a clear reason.

2. Baseline Validation

Before running functional tests:

Run the existing project validation commands.

Possible commands:

npm run lint
npm run typecheck
npm test
npm run build

Only run commands that actually exist in the repository.

Record:

Command
Result
Errors
Warnings

Fix blocking errors before continuing.

3. Project Structure Validation

Inspect the final project structure.

Verify that:

Documentation is present.
Application code is organized.
Dashboard code is separated.
Storefront code is separated.
Shopify extensions are organized.
API routes are organized.
Services are separated from UI.
Database configuration is centralized.
Environment configuration is documented.

Look for:

Duplicate implementations
Dead files
Unused code
Temporary files
Debug files
Hardcoded credentials
Test secrets
Unnecessary dependencies
4. Environment Configuration

Review environment variables.

Verify that:

DATABASE_URL
SHOPIFY_API_KEY
SHOPIFY_API_SECRET
SHOPIFY_APP_URL
SHOPIFY_SCOPES
SESSION_SECRET

and other required environment variables are handled securely according to the actual project configuration.

Do not assume variable names if the implementation uses different names.

Verify:

No secrets are committed.
.env is ignored by Git.
.env.example does not contain real credentials.
Production secrets are not hardcoded.
Client-side code does not expose private secrets.
5. Database Testing

Validate the Prisma/PostgreSQL implementation.

Test:

Database connection
Prisma client
Migrations
Relations
Indexes
Constraints

Verify that the expected models exist.

At minimum inspect:

User
Shop
Bundle
BundleProduct
Template
Customization
AnalyticsEvent
Subscription

Use the actual project schema as the source of truth.

6. Database Migration Testing

Verify that migrations work correctly.

Test:

Fresh database
    ↓
Apply migrations
    ↓
Generate Prisma client
    ↓
Application starts

If seed data exists, verify that seeding works correctly.

Do not delete production data.

Do not run destructive database commands against production.

7. Multi-Tenant Database Isolation

This is a mandatory security test.

Create test data for at least two shops:

Shop A
Shop B

Verify:

Shop A
    ↓
Only Shop A data

Shop B
    ↓
Only Shop B data

Test isolation for:

Bundles
Bundle Products
Analytics
Subscriptions
Settings

A merchant must never be able to retrieve or modify another merchant's data.

8. Authentication Testing

Test the Shopify authentication flow.

Validate:

Install
    ↓
OAuth
    ↓
Callback
    ↓
Shop/session creation
    ↓
Authenticated dashboard

Test:

Valid authentication
Invalid authentication
Expired session
Missing session
Unauthorized dashboard request
Unauthorized API request

Protected resources must reject unauthenticated requests.

9. Session Security

Verify:

Sessions are securely stored.
Sessions are associated with the correct shop.
Session expiration is handled.
Invalid sessions are rejected.
Session information is not exposed to the storefront.
Shopify access tokens are never returned to the browser.

Do not log sensitive session information.

10. Merchant Dashboard Testing

Test:

/dashboard
/dashboard/bundles
/dashboard/bundles/new
/dashboard/analytics
/dashboard/settings

If billing is implemented:

/dashboard/billing

Verify:

Navigation
Page rendering
Loading states
Empty states
Error states
Responsive behavior
Authentication protection
11. Bundle Creation End-to-End Test

Test the complete merchant flow:

Login
  ↓
Dashboard
  ↓
Create Bundle
  ↓
Select Template
  ↓
Select Products
  ↓
Configure Discount
  ↓
Customize Design
  ↓
Review
  ↓
Save Draft
  ↓
Publish

Verify that the resulting bundle exists correctly in the database.

12. Fixed Bundle Testing

Create a Fixed Bundle.

Verify:

Bundle name
Products
Discount
Customization
Status

Test:

Draft
Active
Inactive

Verify invalid configurations are rejected.

13. Quantity Bundle Testing

Create a Quantity Bundle.

Test:

Required quantity
Available products
Discount

Verify:

Valid quantity works.
Zero quantity is rejected.
Negative quantity is rejected.
Insufficient selection is rejected.
Valid selection can be added to cart.
14. Mix & Match Testing

Create a Mix & Match bundle.

Verify:

Available products display.
Required selection quantity works.
Invalid selections are rejected.
Valid selections can be added to cart.
Discount eligibility works.

Test both:

Valid selection
Invalid selection
15. Bundle CRUD Testing

Test:

Create
Read
Update
Delete

for bundles.

Verify:

Correct shop ownership.
Correct database relationships.
Associated products are handled correctly.
Customization data is preserved.
Deleted bundles cannot be retrieved.

Do not delete Shopify products when deleting a BundleCraft bundle.

16. Bundle Publishing Testing

Test:

Draft
   ↓
Publish
   ↓
Active

Verify that an invalid bundle cannot be published.

Test examples:

Missing products
Invalid discount
Invalid quantity
Invalid bundle type
Missing required configuration

The system must return structured validation errors.

17. Storefront Widget Testing

Test the customer-facing widget.

Verify:

Widget loads.
Active bundles display.
Inactive bundles do not display.
Product information displays.
Bundle customization displays.
Product selection works.
Variant selection works.
Add to Cart works.

Test on:

Desktop
Tablet
Mobile
18. Fixed Bundle Storefront Test

Test:

Customer opens product page
      ↓
Fixed Bundle appears
      ↓
Customer reviews products
      ↓
Customer clicks Add Bundle
      ↓
Products added to cart

Verify the correct products and variants are added.

19. Quantity Bundle Storefront Test

Test:

Customer opens bundle
      ↓
Selects products
      ↓
Required quantity not reached
      ↓
Add Bundle blocked

Then:

Required quantity reached
      ↓
Add Bundle
      ↓
Cart succeeds
20. Mix & Match Storefront Test

Test:

Select fewer products than required

Expected:

Cannot add bundle.

Then:

Select required number of products

Expected:

Bundle can be added to cart.
21. Cart Testing

Verify:

Correct products added.
Correct variants added.
Correct quantities added.
Bundle metadata is handled correctly.
Cart errors are handled.
Duplicate clicks do not create unintended behavior.

Test cart failure behavior.

Analytics failure must not prevent successful cart operations.

22. Shopify Discount Testing

Test the Shopify discount implementation where a suitable Shopify development/test environment is available.

Verify:

Active bundle
    ↓
Eligible cart
    ↓
Discount applied

Test:

Percentage
10% discount
Fixed Amount
Fixed amount discount
Invalid Bundle
No discount
Inactive Bundle
No discount
Unrelated Product
No bundle discount

Do not claim live Shopify discount execution was verified unless it was actually tested in a Shopify environment.

23. Discount Boundary Testing

Test:

Required quantity - 1
Required quantity
Required quantity + 1

Verify discount behavior is consistent with the bundle configuration.

Also test:

Zero discount
Invalid discount
Negative discount
Percentage over allowed range
24. Analytics Event Testing

Test:

bundle_view
bundle_add
bundle_purchase

Verify that:

Valid events are stored.
Invalid event types are rejected.
Events belong to the correct shop.
Events reference valid bundles where required.
25. Analytics Calculation Testing

Verify:

Bundle Views
Bundle Adds
Bundle Purchases
Revenue Generated
Conversion Rate

Test:

100 views
10 purchases

Expected conversion calculation according to the analytics documentation:

10%

Also test:

0 views
0 purchases

There must be no:

NaN
Infinity
division-by-zero error
26. Analytics Attribution Testing

Where the current implementation supports it, test:

Bundle View
    ↓
Bundle Add
    ↓
Bundle Purchase

Verify that the events can be associated with the correct bundle.

If live Shopify purchase attribution is not available in the test environment:

Test the available integration boundary.
Document the limitation.
Do not claim full live attribution validation.
27. Analytics Failure Isolation

Test:

Cart operation succeeds
Analytics request fails

Expected:

Cart still succeeds.

Also test:

Bundle view tracking fails

Expected:

Bundle UI still works.

Analytics must not become a hard dependency for storefront functionality.

28. Billing Testing

If a Shopify development/test environment is available, test:

Current Plan
Plan Selection
Subscription Creation
Approval
Subscription Activation
Plan Change
Cancellation

Verify local subscription state is synchronized correctly.

Do not mark a subscription active merely because the frontend redirected to a billing URL.

29. Billing Plan Testing

Verify:

Free
Starter
Growth
Pro

using the actual configured plans.

Test:

Current plan
Upgrade
Downgrade where supported
Cancellation

Do not invent pricing or limits during testing.

30. Billing Security Testing

Verify:

Shop A cannot access Shop B billing.
Shop A cannot modify Shop B subscription.
Anonymous users cannot modify billing.

Also verify:

Payment information is not stored.
Shopify credentials remain private.
Billing API responses do not expose secrets.
31. API Testing

Test all major API groups.

Authentication
/api/auth/*
Bundles
/api/bundles
/api/bundles/:id
Analytics
/api/analytics/event
/api/analytics/overview
/api/analytics/bundle/:id
Billing
/api/billing/*

Use the actual implemented endpoints.

Test:

Valid request
Invalid request
Missing authentication
Wrong shop
Missing resource
Malformed payload
32. API Security Testing

For every protected API:

Test:

No session
Invalid session
Valid session
Different merchant session

Expected:

Unauthorized → rejected
Wrong merchant → rejected
Valid merchant → allowed

Never rely only on frontend route protection.

33. Input Validation Testing

Test malicious or malformed input such as:

Empty strings
Very long strings
Negative numbers
Invalid IDs
Invalid enum values
Malformed JSON
Unexpected fields
Invalid dates
Invalid discount values
Invalid quantities

Verify that invalid input is rejected safely.

34. SQL/Database Security Testing

Inspect database queries and Prisma usage.

Verify:

Prisma is used correctly.
Raw SQL is not used unnecessarily.
User input is not concatenated into SQL.
Shop ownership is validated before queries.
Transactions are used where required.

Do not introduce raw SQL simply for testing.

35. XSS Testing

Inspect user-controlled fields such as:

Bundle name
Bundle description
Customization values
Product-related display values
Analytics metadata

Verify that user-controlled content cannot inject executable JavaScript into:

Dashboard
Storefront
API responses

Use the framework's safe rendering mechanisms.

Do not introduce unsafe HTML rendering unless absolutely required.

36. CSRF / Request Security

Inspect state-changing requests:

POST
PUT
PATCH
DELETE

Verify that the existing authentication architecture protects them appropriately.

Do not invent a separate security layer that conflicts with the Shopify embedded app architecture.

37. Secret Exposure Audit

Search the repository for patterns such as:

SHOPIFY_API_SECRET
access token
DATABASE_URL
SESSION_SECRET
password
private key

Verify no real secrets exist in:

Git history where possible
Source files
Client JavaScript
Theme extension assets
Public environment variables
Documentation
Test fixtures

Do not print discovered secret values in the final report.

38. Git Security

Check:

.gitignore

Verify sensitive files are ignored.

At minimum check for:

.env
.env.local
.env.production
node_modules

according to the project's actual setup.

39. Dependency Audit

Inspect project dependencies.

Run the package manager's supported audit command if available.

Example:

npm audit

Do not automatically upgrade every dependency.

For vulnerabilities:

Identify package.
Identify severity.
Determine whether it affects production.
Apply the smallest safe fix.
Re-run tests.

Do not introduce breaking upgrades without verification.

40. Performance Testing

Inspect:

Dashboard
Initial page load
API request count
Large bundle lists
Analytics queries
Storefront
JavaScript size
API requests
Widget rendering
Mobile performance
Cart interaction
Backend
Database queries
N+1 patterns
Large analytics queries
Repeated Shopify API calls

Avoid premature optimization.

Fix clear performance bottlenecks.

41. Storefront Performance

The BundleCraft storefront widget must not significantly degrade merchant storefront performance.

Check:

JavaScript payload
Network requests
Rendering time
Blocking resources

Avoid:

Large libraries
Unnecessary dependencies
Repeated API calls
Duplicate requests
Loading the entire dashboard application
42. Responsive Testing

Test the application at common viewport categories:

Mobile
Tablet
Desktop
Large Desktop

Inspect:

Dashboard
Bundle wizard
Analytics
Billing
Storefront widget
Bundle landing page

Verify:

No horizontal overflow.
Buttons remain usable.
Tables remain readable.
Forms remain usable.
Navigation works.
43. Accessibility Testing

Verify:

Keyboard navigation
Focus states
Form labels
Button labels
Semantic HTML
Screen reader-friendly messages
Accessible error messages
Accessible loading states
Color is not the only status indicator

Fix obvious accessibility issues discovered during testing.

44. Error Boundary Testing

Test application behavior when:

API fails
Database fails
Shopify API fails
Unexpected component error occurs

The application should show a safe error state.

Do not expose stack traces to merchants or customers.

45. Logging Review

Inspect logging.

Verify that logs do not contain:

Shopify access tokens
Session secrets
Database credentials
Payment information
Sensitive customer information

Logs should contain enough context to troubleshoot errors without exposing secrets.

46. Production Configuration Review

Review:

Environment variables
Database configuration
Shopify configuration
App URL
OAuth configuration
Webhook configuration
Theme extension configuration
Shopify Function configuration

Verify that development URLs or localhost assumptions are not accidentally used in production configuration.

Do not change production credentials.

47. Build Validation

Run the production build.

Possible command:

npm run build

Verify:

Build succeeds.
No TypeScript errors.
No unresolved imports.
No invalid environment assumptions.
No server/client boundary violations.

If the build fails:

Identify the cause.
Fix it.
Re-run the build.
Record the final result.
48. Shopify App Validation

Where Shopify CLI and the project configuration support it, validate:

App configuration
Extensions
Theme App Extension
Shopify Function
App URLs
OAuth configuration

Use only the commands supported by the actual project.

Do not claim Shopify validation succeeded if the environment is unavailable.

49. End-to-End Merchant Flow

Perform the complete merchant flow:

Shopify App Install
        ↓
OAuth
        ↓
Dashboard
        ↓
Create Bundle
        ↓
Select Template
        ↓
Select Products
        ↓
Configure Discount
        ↓
Customize
        ↓
Save Draft
        ↓
Publish
        ↓
Bundle Active

Verify the bundle appears correctly on the storefront.

50. End-to-End Customer Flow

Perform:

Customer visits storefront
        ↓
Bundle widget appears
        ↓
Customer selects bundle
        ↓
Customer selects variants
        ↓
Customer adds bundle
        ↓
Cart updates
        ↓
Discount applies where configured
        ↓
Purchase
        ↓
Analytics recorded

Test each stage independently if the complete live flow cannot be executed.

Document any unavailable external dependency.

51. End-to-End Billing Flow

Where a live Shopify development environment is available:

Merchant opens Billing
        ↓
Selects plan
        ↓
Shopify billing approval
        ↓
Subscription active
        ↓
Feature access updated
        ↓
Merchant uses paid features

Test cancellation and plan changes where supported.

Do not claim completion without actual verification.

52. Regression Testing

After fixing bugs, re-run all affected tests.

Do not assume that fixing one subsystem cannot affect another.

Pay particular attention to:

Authentication
Bundle Engine
Storefront
Discount
Analytics
Billing
53. Bug Classification

Classify discovered issues as:

CRITICAL
HIGH
MEDIUM
LOW
CRITICAL

Examples:

Authentication bypass
Cross-merchant data exposure
Payment/billing security issue
Production secret exposure
Complete application failure
HIGH

Examples:

Bundle cannot be published
Storefront Add to Cart fails
Discount system fails
Major merchant workflow broken
MEDIUM

Examples:

Non-critical dashboard issue
Analytics calculation problem
UI workflow problem with workaround
LOW

Examples:

Minor UI issue
Cosmetic issue
Non-blocking warning

Do not leave CRITICAL or HIGH issues unresolved before production release unless explicitly documented and accepted.

54. Bug Fix Rules

When fixing bugs:

Reproduce the issue.
Identify root cause.
Apply the smallest safe fix.
Add or update a test.
Re-run affected tests.
Re-run the full validation suite where practical.
Document the fix.

Do not rewrite large sections of the application to fix a small issue.

55. Production Readiness Checklist

Before declaring the MVP production-ready, verify:

Application
 Build succeeds
 TypeScript passes
 Lint passes
 Tests pass
 No critical errors
Database
 Migrations work
 Prisma client works
 Relationships work
 Indexes exist where required
 Multi-tenant isolation verified
Authentication
 OAuth works
 Sessions work
 Protected routes work
 Unauthorized requests rejected
Bundle Engine
 Fixed Bundle works
 Quantity Bundle works
 Mix & Match works
 CRUD works
 Publishing works
Storefront
 Widget works
 Bundle landing page works
 Product selection works
 Variant selection works
 Cart integration works
 Mobile layout works
Discount
 Percentage discount tested
 Fixed amount discount tested
 Eligibility works
 Inactive bundle does not receive discount
Analytics
 View tracking works
 Add tracking works
 Purchase tracking boundary works
 Revenue tracking works where supported
 Conversion calculation works
Billing
 Plans configured
 Subscription flow works where testable
 Feature gating works
 Cancellation works where supported
 Billing data isolated by shop
Security
 No secrets exposed
 Cross-shop access blocked
 Input validation works
 Sensitive logs removed
 Payment information not stored
Performance
 Storefront widget is lightweight
 Analytics queries are efficient
 No obvious N+1 queries
 Dashboard is responsive
Accessibility
 Keyboard navigation
 Form labels
 Focus states
 Accessible errors
 Accessible loading states
56. Final Production Checklist

Before release, verify:

Environment
Database
Shopify App
OAuth
Webhooks
Theme App Extension
Shopify Function
Dashboard
Bundle Engine
Storefront
Discounts
Analytics
Billing
Security
Testing
Performance
Accessibility

Every area must have one of:

PASS
PASS WITH LIMITATION
BLOCKED

Do not mark an area as PASS if it was not actually tested.

57. Final Verification Commands

Run only commands that exist in the project.

Possible commands:

npm run lint
npm run typecheck
npm test
npm run build
npm audit

Also run existing:

Prisma validation
Shopify CLI validation
Extension build
Function validation

where applicable.

Do not invent commands.

58. Final QA Report

After testing, provide a structured report.

1. Executive Summary

State whether the application is:

READY
READY WITH LIMITATIONS
NOT READY

Base this only on actual test results.

Do not hide unresolved Critical/High issues.

2. Test Summary

Provide:

Total Tests
Passed
Failed
Skipped
Blocked

If exact counts are unavailable, provide the actual available test information rather than inventing numbers.

3. Module Results

Report:

Authentication
Database
Merchant Dashboard
Bundle Engine
Storefront Widget
Discount Function
Analytics
Billing
Security
Performance
Accessibility

For each:

PASS
PASS WITH LIMITATION
BLOCKED

with a short explanation.

4. Bugs Found

For each bug:

Severity
Issue
Root Cause
Fix
Test Added
Status
5. Security Findings

Report:

Authentication findings
Authorization findings
Multi-tenant isolation
Secret exposure
Input validation
Logging
Payment/billing security

Do not include actual secrets.

6. Shopify Limitations

Clearly document anything that could not be verified because of:

Shopify development environment
Shopify merchant approval
Shopify Function deployment
Storefront environment
Billing environment
Webhook availability

Do not claim live Shopify verification when it was not performed.

7. Production Readiness

Provide:

Production Status:
READY / READY WITH LIMITATIONS / NOT READY

Explain the decision using only factual test results.

59. Documentation Updates

If testing reveals that the implementation differs from the documentation:

Identify the difference.
Update the relevant documentation if appropriate.
Clearly mention the documentation update in the final report.

Do not silently change architecture documentation.

60. Final Rule

This action is the final MVP validation phase.

Do not add unrelated features.

Do not start the future roadmap.

Do not implement:

BOGO bundles
Gift bundles
Volume bundles
Multi-currency
Multilingual support
B2B
Wholesale
AI features
Advanced reporting
Additional payment providers

Only test, fix, validate, and prepare the existing BundleCraft MVP for production.

61. Completion Report

After completing the entire QA process, provide:

Final Status
READY
READY WITH LIMITATIONS
NOT READY
Test Results

Provide actual results.

Critical Issues

List all unresolved Critical issues.

High Issues

List all unresolved High issues.

Medium/Low Issues

List remaining non-blocking issues.

Fixed Issues

List important bugs that were fixed.

Security Status

Summarize security validation.

Shopify Status

Summarize what was successfully verified and what could not be verified.

Production Recommendations

List only concrete remaining steps required before deployment.

Documentation Updated

List any documentation files changed.

END OF ACTION-010

Do not automatically start another implementation action after completing this file.
```
