# ACTION-017 — Security Hardening

## Objective

Perform a comprehensive security hardening pass on the BundleCraft application before production deployment.

The goal is to identify and fix security weaknesses across:

- Shopify authentication
- OAuth/session handling
- API routes
- Database access
- Multi-tenant isolation
- Storefront
- Webhooks
- Billing
- Analytics
- Product synchronization
- Environment variables
- Input validation
- Error handling
- HTTP security
- Dependency security

This action must improve the security of the existing implementation without changing the intended MVP functionality.

Do not add unrelated features.

---

# Required Documentation To Read First

Before writing any code, Claude Code MUST read:

1. `CLAUDE.md`
2. `docs/01-PRD.md`
3. `docs/02-ARCHITECTURE.md`
4. `docs/04-DATABASE_DESIGN.md`
5. `docs/05-SHOPIFY_INTEGRATION.md`
6. `docs/06-API_SPECIFICATION.md`
7. `docs/07-AUTHENTICATION.md`
8. `docs/08-STOREFRONT_WIDGET.md`
9. `docs/09-BUNDLE_ENGINE.md`
10. `docs/11-ANALYTICS_SYSTEM.md`
11. `docs/12-BILLING_SYSTEM.md`
12. `docs/13-SECURITY.md`
13. `docs/14-TESTING_STRATEGY.md`

Also inspect:

```text
actions/ACTION-003-shopify-authentication.md
actions/ACTION-005-bundle-engine.md
actions/ACTION-006-storefront-widget.md
actions/ACTION-007-discount-function.md
actions/ACTION-008-analytics-system.md
actions/ACTION-009-billing-system.md
actions/ACTION-011-shopify-webhooks.md
actions/ACTION-012-product-sync.md
actions/ACTION-015-theme-customization.md
actions/ACTION-016-performance-optimization.md

Read the actual implementation before making changes.

Do not assume previous security controls were implemented correctly.

Role

Act as a senior application security engineer specializing in:

Shopify apps
Next.js
React
TypeScript
PostgreSQL
Prisma
Multi-tenant SaaS
API security

Perform a practical production security review and hardening pass.

Do not introduce unnecessary security infrastructure.

Scope

Review and harden:

Authentication
Authorization
Shopify OAuth
Session handling
API routes
Webhooks
Database access
Multi-tenant isolation
Input validation
Output handling
XSS protection
CSRF considerations
Rate limiting
Secrets
Environment variables
Logging
Error handling
HTTP headers
Dependencies
Storefront security
Billing security
Analytics security
Product synchronization security
1. Security Baseline

Before modifying code, inspect the current application.

Identify:

Authentication mechanisms
Authorization middleware
Protected routes
Public routes
API routes
Webhook routes
Admin routes
Storefront routes
Database access patterns
Secret handling
Logging
Error handling

Create a concise security findings list.

Classify findings as:

CRITICAL
HIGH
MEDIUM
LOW
INFORMATIONAL

Do not invent vulnerabilities.

Only report issues supported by the actual implementation.

2. Shopify OAuth Security

Review the Shopify OAuth implementation from:

actions/ACTION-003-shopify-authentication.md

Verify:

OAuth state validation where applicable
Callback validation
Shop/domain validation
Session creation
Session expiration
Access token handling
Token storage
Token retrieval
Token revocation/uninstall behavior

Do not expose Shopify access tokens to the browser.

Do not log access tokens.

3. Session Security

Review application sessions.

Verify:

Session identity is server-side where appropriate
Session expiration exists
Session cookies use secure settings in production
HTTP-only cookies are used where applicable
Appropriate SameSite behavior is configured
Session data cannot be modified by the client
A user cannot switch tenant/shop through client-controlled session data

Do not weaken authentication to make local development easier.

4. Authentication Middleware

Review protected routes.

At minimum inspect:

/dashboard/*
/api/bundles/*
/api/products/*
/api/analytics/*
/api/billing/*
/api/settings/*

Ensure protected endpoints cannot be accessed without valid authentication.

Do not rely solely on frontend route protection.

The backend must enforce authorization.

5. Multi-Tenant Isolation

This is one of the highest-priority security checks.

Every merchant/shop must only access its own data.

Review all database queries involving:

Shop
Bundle
BundleProduct
Product
ProductVariant
Customization
AnalyticsEvent
Subscription
Template

Look for queries such as:

findUnique({
  where: {
    id
  }
})

where ownership is not separately verified.

Prefer tenant-aware access patterns.

Conceptually:

Authenticated Shop
        ↓
shopId
        ↓
Requested Resource
        ↓
Ownership Verification
        ↓
Allow / Reject

Test specifically for IDOR/cross-tenant access.

6. Bundle Authorization

Verify that a merchant cannot:

Read another merchant's bundle
Update another merchant's bundle
Delete another merchant's bundle
Publish another merchant's bundle
Modify another merchant's customization
Access another merchant's bundle analytics

Never trust:

shopId

sent from the browser.

Derive shop identity from the authenticated session.

7. Product Authorization

Verify:

Product queries are shop-scoped
Variant queries are shop-scoped
Product synchronization is shop-scoped
Product APIs cannot expose another shop's catalog

Test:

Shop A → Product A
Shop A → Product B

where Product B belongs to Shop B.

The second operation must be rejected.

8. Analytics Authorization

Review:

/api/analytics/*

Ensure merchants cannot query another shop's:

Bundle views
Bundle adds
Bundle purchases
Revenue
Conversion data

Analytics aggregation must always include the authenticated shop context.

9. Billing Authorization

Review billing endpoints.

Ensure a merchant cannot:

Change another shop's plan
Cancel another shop's subscription
Read another shop's billing state
Modify another shop's subscription metadata

Billing operations must use the authenticated shop context.

Do not trust:

shopId
subscriptionId

from the browser without server-side verification.

10. Input Validation

Review all external input.

Sources include:

Query parameters
URL parameters
JSON bodies
Form data
Shopify webhook payloads
Headers
Storefront requests

Validate:

type
format
length
allowed values
required fields

Use the project's existing validation approach.

Do not trust client-side validation.

11. Bundle Input Validation

Review bundle creation/update inputs.

Validate:

Bundle name
Description
Bundle type
Product IDs
Variant IDs
Discount type
Discount value
Status
Customization
Template ID

Reject:

Invalid enum values
Negative prices/discounts where invalid
Excessively large strings
Invalid IDs
Malformed objects
Unexpected fields

Do not duplicate the entire Bundle Engine.

Strengthen its input boundaries.

12. Customization Security

Review:

ACTION-015-theme-customization.md

Ensure merchant customization cannot inject:

<script>
javascript:
onerror=
onload=
arbitrary CSS
arbitrary HTML
external script URLs

Especially verify:

Colors
Font family
Font size
Layout
Background values

Only allow values supported by the customization schema.

13. XSS Protection

Search the application for dangerous rendering patterns.

Inspect:

dangerouslySetInnerHTML
innerHTML
eval
Function()
document.write

Any use must have a documented reason and safe sanitization.

Do not introduce raw HTML rendering unless necessary.

Customer-controlled and merchant-controlled content must not become executable JavaScript.

14. URL Validation

Review any user-controlled URLs.

Prevent unsafe schemes such as:

javascript:
data:
vbscript:

where those URLs are not explicitly required.

Validate external URLs before rendering them.

15. SQL/Database Security

Review Prisma/database access.

Ensure the application does not construct raw SQL from untrusted user input.

Search for:

$executeRaw
$executeRawUnsafe
$queryRaw
$queryRawUnsafe

If raw SQL exists:

Verify parameters are safely bound.
Remove unnecessary unsafe queries.
Document legitimate use cases.

Do not disable database constraints to bypass application issues.

16. Prisma Security

Verify:

Prisma client is not exposed to the browser
Database credentials are server-side only
Database errors are not returned directly to clients
Queries enforce tenant boundaries
Sensitive columns are not unnecessarily returned

Do not serialize entire database records to frontend clients.

17. Shopify Webhook Security

Review:

ACTION-011-shopify-webhooks.md

Verify:

HMAC validation
Raw-body verification
Event identification
Shop identification
Idempotency
Replay/duplicate handling
Safe error handling

Invalid webhook requests must be rejected.

Never disable HMAC validation.

18. Webhook Replay Protection

Verify webhook event idempotency.

Repeated delivery of the same event must not:

Duplicate products
Duplicate processing
Duplicate analytics
Corrupt shop state
Re-run destructive actions unexpectedly

Review event IDs and persistence logic.

19. Webhook Payload Security

Treat webhook payloads as external input.

Validate:

Required fields
Expected types
Shop context
Event type

Do not assume a correctly signed payload means every field is safe to use without validation.

20. API Rate Limiting

Review public and sensitive API endpoints.

Potential high-risk endpoints:

/api/auth/*
/api/bundles/*
/api/products/*
/api/analytics/*
/api/billing/*

Determine where rate limiting is necessary.

If the application already has rate limiting, verify it.

If not, implement a lightweight appropriate strategy for sensitive endpoints where practical.

Do not introduce an expensive distributed infrastructure unless required.

21. Abuse Prevention

Review operations that could be abused to consume resources.

Examples:

Unlimited product synchronization
Repeated analytics event submission
Excessive bundle creation
Excessive API requests
Repeated billing operations
Repeated webhook processing

Add reasonable safeguards where needed.

Do not block legitimate merchant activity.

22. CSRF Review

Review state-changing browser requests.

Especially:

POST
PUT
PATCH
DELETE

Determine the protection provided by the current Shopify embedded-app/session architecture.

Do not add a conflicting CSRF system without understanding the current authentication architecture.

State clearly in the final report:

What protection exists
What was added
What remains dependent on Shopify/framework protections
23. CORS Review

Inspect CORS configuration.

Do not use:

Access-Control-Allow-Origin: *

for authenticated APIs unless there is a documented reason.

Restrict origins appropriately.

The storefront integration must still function correctly.

24. HTTP Security Headers

Review appropriate security headers.

Potential headers include:

Content-Security-Policy
X-Content-Type-Options
Referrer-Policy
Permissions-Policy
Strict-Transport-Security

Only configure headers compatible with the Shopify embedded-app and storefront architecture.

Do not blindly apply a CSP that breaks:

Shopify App Bridge
Shopify Admin
Theme App Extension
Storefront functionality

Document any necessary exceptions.

25. Content Security Policy

If CSP is implemented, carefully review:

Script sources
Style sources
Image sources
Connect sources
Frame behavior

Do not allow broad unsafe policies unless required.

Avoid:

*

where a more restricted policy is possible.

Do not break the Shopify app because of an overly aggressive CSP.

26. Environment Variables

Audit:

.env
.env.local
.env.example

Ensure:

Secrets are not committed
Production secrets are not hardcoded
Client-exposed variables contain no secrets
Shopify credentials remain server-side
Database credentials remain server-side

Pay particular attention to:

NEXT_PUBLIC_*

Anything using this prefix may be exposed to the browser.

Do not place secrets in public environment variables.

27. Secret Scanning

Search the repository for potential secrets.

Inspect for:

API keys
Shopify secrets
Access tokens
Database URLs with credentials
JWT secrets
Private keys
Webhook secrets

Do not print discovered secrets in the final report.

If a secret is accidentally committed:

Remove it from source
Document that rotation is required
Do not reproduce the secret
28. Error Handling

Review application error responses.

Ensure production responses do not expose:

Stack traces
File paths
SQL queries
Database credentials
Access tokens
Internal service configuration

Return safe public error messages.

Keep detailed errors in secure server-side logs.

29. Logging Security

Review logging.

Never log:

Shopify access tokens
Shopify app secrets
Database passwords
Session secrets
Payment credentials
Full sensitive request bodies

Be careful with:

Authorization
Cookie
Set-Cookie

headers.

Sanitize sensitive information before logging.

30. Billing Security

Review:

ACTION-009-billing-system.md

Ensure:

Billing state is shop-scoped
Plan access is server-enforced
Feature gates cannot be bypassed by modifying frontend state
Billing callbacks/webhooks are validated
Subscription IDs are not trusted without ownership validation

A user must not unlock paid functionality simply by modifying browser requests.

31. Feature Gate Security

If the application has plan-based feature restrictions:

Free
Starter
Growth
Pro

verify that feature checks occur server-side for protected operations.

Do not rely only on:

disabled button
hidden UI
frontend condition

The API/service layer must enforce restrictions where necessary.

32. Storefront Security

Review customer-facing code.

Ensure it does not expose:

Shopify Admin API credentials
App secrets
Database credentials
Internal merchant information
Private analytics
Billing information

Only expose data required for the customer-facing bundle experience.

33. Product Sync Security

Review:

ACTION-012-product-sync.md

Ensure product synchronization:

Uses the correct shop credentials
Cannot cross tenant boundaries
Does not expose Admin API credentials
Validates Shopify payloads
Handles deleted products safely
Does not trust browser-provided shop IDs
34. Dependency Security

Inspect project dependencies.

Run the project's supported audit command, such as:

npm audit

if appropriate.

Review findings carefully.

Do not blindly upgrade every dependency.

For vulnerabilities:

Critical
High
Moderate
Low

document:

Package
Vulnerability
Current version
Available fix
Whether upgrading is safe
Whether mitigation is required

Do not claim that a vulnerability is fixed unless it actually is.

35. Security Headers Verification

Where possible verify the application's production HTTP responses.

Check appropriate headers.

Do not claim production verification unless the deployed application was actually tested.

36. Authentication Tests

Create/verify tests for:

Unauthenticated request
Expired session
Invalid session
Valid session
Cross-shop access
Protected API access
37. Authorization Tests

Create tests for:

Bundle
Read own bundle
Reject other shop's bundle
Update own bundle
Reject other shop update
Delete own bundle
Reject other shop deletion
Products
Read own products
Reject other shop products
Analytics
Read own analytics
Reject other shop analytics
Billing
Read own subscription
Reject other shop subscription
Customization
Update own customization
Reject other shop customization
38. Input Security Tests

Test:

Invalid JSON
Unexpected fields
Oversized strings
Invalid IDs
Invalid enum values
Invalid colors
Malicious CSS
Malicious URLs
XSS payloads

The application should reject or safely handle malicious input.

39. Rate Limit Tests

If rate limiting is implemented, verify:

Requests within limit succeed
Requests above limit are rejected appropriately
Legitimate requests recover after the limit window

Do not make timing-sensitive tests unnecessarily brittle.

40. Security Regression Tests

Ensure existing functionality continues working:

Shopify authentication
Dashboard
Bundle creation
Product selection
Storefront
Cart
Discount
Analytics
Billing
Webhooks

Security hardening must not silently break the MVP.

41. Type Safety

Maintain TypeScript safety.

Do not use:

any

to bypass security-related type errors.

Do not disable:

TypeScript checks
ESLint security rules
Validation
Authentication checks

to make tests pass.

42. Documentation Updates

Update:

docs/13-SECURITY.md

with the actual security architecture.

Also update where necessary:

docs/07-AUTHENTICATION.md
docs/05-SHOPIFY_INTEGRATION.md
docs/06-API_SPECIFICATION.md
docs/14-TESTING_STRATEGY.md

Document:

Authentication controls
Authorization model
Tenant isolation
Webhook verification
Input validation
Rate limiting
Security headers
Secret management
Logging rules
Dependency security

Do not document security controls that were not actually implemented.

43. Validation Commands

Run the project's actual validation commands.

Attempt:

npm run lint
npm run typecheck
npm test
npm run build
npm audit

If a command does not exist:

Do not invent it.
Use the actual project equivalent if available.
Report it honestly.
44. Final Security Verification Checklist

Before marking this action complete:

 Security baseline reviewed
 Security findings documented
 Shopify OAuth reviewed
 Session security reviewed
 Authentication middleware reviewed
 Multi-tenant isolation verified
 Bundle authorization verified
 Product authorization verified
 Analytics authorization verified
 Billing authorization verified
 Input validation reviewed
 Bundle validation reviewed
 Customization security reviewed
 XSS risks reviewed
 URL validation reviewed
 Database security reviewed
 Prisma security reviewed
 Webhook HMAC verification reviewed
 Webhook idempotency reviewed
 Webhook payload validation reviewed
 Rate limiting reviewed
 Abuse prevention reviewed
 CSRF protection reviewed
 CORS reviewed
 HTTP security headers reviewed
 CSP reviewed where applicable
 Environment variables audited
 Secret scanning performed
 Error handling reviewed
 Logging security reviewed
 Billing security reviewed
 Feature gates reviewed
 Storefront security reviewed
 Product sync security reviewed
 Dependency audit performed
 Authentication tests verified
 Authorization tests verified
 Input security tests verified
 Regression tests verified
 Documentation updated
 Lint checked
 Typecheck checked
 Tests checked
 Build checked
 Dependency audit checked
Important Restrictions

DO NOT implement:

New MVP features
New bundle types
New billing features
New analytics features
AI features
Unrelated refactoring
New authentication providers
New payment providers
Custom security infrastructure without justification
Breaking dependency upgrades without review

Do not weaken existing functionality to make a security test pass.

Keep this action focused on:

Production Security Hardening.

Completion Report

When finished, provide:

1. Security Summary

Summarize the security review.

2. Findings

Report actual findings using:

Severity:
Area:
Finding:
Action Taken:
Status:

Do not invent findings.

3. Authentication

Explain the final authentication/security state.

4. Authorization

Explain tenant isolation and resource ownership enforcement.

5. Webhook Security

Explain HMAC verification and idempotency.

6. Input Security

Explain validation and XSS protections.

7. Secrets

Report whether secrets were found.

Never print actual secret values.

8. HTTP Security

Report relevant security headers/CSP/CORS findings.

9. Dependency Audit

Report actual audit results.

10. Tests

List security tests created/run and actual results.

11. Validation

Report actual results:

Lint:
Typecheck:
Tests:
Build:
Audit:
12. Remaining Risks

List unresolved security risks honestly.

13. Files Created

List every new file.

14. Files Modified

List every modified file.

15. Documentation

List documentation files updated.

16. Next Action

After completing this action, the next planned action is:

ACTION-018-error-monitoring-and-logging.md

Do not execute the next action automatically.
```
