# ACTION-019 — Production Deployment

## Objective

Prepare and deploy BundleCraft to a production environment.

The deployment must cover:

- Production environment configuration
- Database deployment
- Shopify app configuration
- Application deployment
- Shopify webhook configuration
- Shopify App URL configuration
- Environment variables
- Production build
- Domain/HTTPS readiness
- Database migrations
- Deployment verification
- Production smoke testing
- Rollback readiness

The deployment must use the hosting architecture already defined by the project.

Do not introduce a new hosting provider unless the existing architecture requires it.

---

# Required Documentation To Read First

Before writing any code or performing deployment work, Claude Code MUST read:

1. `CLAUDE.md`
2. `docs/01-PRD.md`
3. `docs/02-ARCHITECTURE.md`
4. `docs/03-TECH_STACK.md`
5. `docs/04-DATABASE_DESIGN.md`
6. `docs/05-SHOPIFY_INTEGRATION.md`
7. `docs/06-API_SPECIFICATION.md`
8. `docs/07-AUTHENTICATION.md`
9. `docs/08-STOREFRONT_WIDGET.md`
10. `docs/09-BUNDLE_ENGINE.md`
11. `docs/11-ANALYTICS_SYSTEM.md`
12. `docs/12-BILLING_SYSTEM.md`
13. `docs/13-SECURITY.md`
14. `docs/14-TESTING_STRATEGY.md`

Also inspect:

```text
actions/ACTION-001-project-initialization.md
actions/ACTION-002-database-setup.md
actions/ACTION-003-shopify-authentication.md
actions/ACTION-007-discount-function.md
actions/ACTION-011-shopify-webhooks.md
actions/ACTION-012-product-sync.md
actions/ACTION-016-performance-optimization.md
actions/ACTION-017-security-hardening.md
actions/ACTION-018-error-monitoring-and-logging.md

Read the actual implementation and deployment configuration before making changes.

Do not assume the project is currently deployment-ready.

Role

Act as a senior DevOps and Shopify SaaS deployment engineer.

Your responsibility is to prepare BundleCraft for a reliable production deployment.

The deployment must be:

Secure
Repeatable
Documented
Reproducible
Observable
Rollback-aware

Do not manually modify production data without explicit justification.

Scope

Implement and verify:

Production build
Production environment configuration
Hosting configuration
Database configuration
Database migrations
Shopify app configuration
OAuth URLs
Webhook URLs
App URLs
Environment variables
HTTPS
Domain configuration where applicable
Deployment configuration
Health checks
Smoke tests
Production verification
Rollback procedure
Deployment documentation
1. Inspect Current Hosting Architecture

First determine where the application is intended to run.

The project architecture may use:

Vercel

or another hosting provider already documented/configured by the project.

Do not automatically migrate the project to another provider.

Inspect:

package.json
next.config.*
deployment configuration
hosting configuration
environment configuration

Determine:

Build command
Start command if applicable
Node.js version
Framework version
Output configuration
Required environment variables
2. Production Readiness Audit

Before deployment, inspect the application for production blockers.

Check:

Build
TypeScript
Lint
Tests
Environment variables
Database
OAuth
Webhooks
Billing
Discount Function
Storefront
Security
Logging

Classify blockers:

BLOCKER
HIGH
MEDIUM
LOW

Do not deploy if a confirmed critical production blocker remains unresolved.

Do not invent blockers.

3. Production Build

Run the project's production build.

Use the actual project command.

Typically:

npm run build

Verify:

Build succeeds
No TypeScript errors
No missing environment variables required at build time
No server/client boundary violations
No accidental secrets in client bundles

Do not disable validation to force the build to pass.

4. Production Environment Variables

Create/update:

.env.example

so it documents every required environment variable without containing real credentials.

Potential categories:

Application
Database
Shopify
Authentication
Billing
Monitoring

Never place production secrets into:

.env.example
Git
Source code
Client-side code
Documentation
5. Environment Variable Audit

Determine which variables are:

Server-only

Examples may include:

DATABASE_URL
SHOPIFY_API_SECRET
SHOPIFY_ACCESS_TOKEN
SESSION_SECRET
MONITORING_SECRET
Client-exposed

Only variables intentionally safe for browser exposure may use the appropriate public prefix.

Do not expose:

Shopify API secret
Database credentials
Session secret
Access tokens
Billing secrets
6. Production Database

Verify the production PostgreSQL/Supabase database configuration.

Confirm:

Database is reachable
SSL/security configuration is appropriate
Prisma can connect
Production credentials are configured
Connection settings are appropriate for the hosting environment

Do not use a local development database in production.

7. Database Migration

Before applying production migrations:

Review pending migrations.
Verify migration order.
Confirm production backup/recovery availability where applicable.
Ensure the migration is compatible with the deployed application.

Use the project's migration workflow.

Do not use destructive commands such as:

prisma db push --force-reset

or equivalent destructive operations against production.

Do not delete production data to solve migration problems.

8. Prisma Production Configuration

Verify the Prisma setup.

Check:

Prisma Client generation
Production connection
Migration execution
Connection reuse
Build integration

Use the project's actual Prisma commands.

Do not create multiple Prisma clients unnecessarily.

9. Shopify App Configuration

Review the Shopify app configuration.

Verify production values for:

App URL
Allowed redirection URLs
OAuth callback URL
Webhook URL
Embedded app configuration

Use the actual deployed domain.

Do not leave development URLs such as:

localhost
127.0.0.1

in production configuration.

10. Shopify OAuth URLs

Verify the complete production OAuth flow:

Shopify Admin
      ↓
BundleCraft App
      ↓
OAuth
      ↓
Callback
      ↓
Session
      ↓
Dashboard

Confirm:

Production callback URL is correct
Redirect URL is HTTPS
Callback route exists
Shopify app configuration matches the application
Invalid redirects are rejected

Do not weaken redirect validation.

11. Webhook Configuration

Review:

ACTION-011-shopify-webhooks.md

Verify production webhook handling.

Confirm:

Webhook endpoint is publicly reachable
HTTPS is enabled
HMAC verification works
Supported topics are registered
Shop identification works
Idempotency works
Uninstall webhook works

Do not claim webhook delivery is verified unless it was actually tested.

12. Webhook Registration

Verify the application's webhook registration strategy.

After installation, the application should register the required webhook topics using the existing webhook registration service.

Do not create duplicate registrations unnecessarily.

Do not manually create duplicate webhook registrations unless required.

13. Shopify Discount Function Deployment

Review:

ACTION-007-discount-function.md

Verify that the Discount Function deployment process is documented and production-ready.

Confirm:

Function source exists
Function builds
Required configuration exists
Deployment instructions are documented
Bundle eligibility logic is connected appropriately

Do not claim the function is live unless it was actually deployed and verified.

14. Storefront Theme App Extension

Review:

ACTION-006-storefront-widget.md
ACTION-013-bundle-landing-page.md

Verify the storefront extension/package.

Check:

Extension structure
Required assets
Production configuration
Bundle widget loading
Storefront API usage
Customer-facing JavaScript
Theme compatibility

Do not claim installation on a real merchant store unless it was actually tested.

15. Billing Configuration

Review:

ACTION-009-billing-system.md

Verify:

Production billing configuration
Plan configuration
Shopify Billing API integration
Subscription lifecycle handling
Production URLs
Feature gates

Do not use test billing settings in production.

Do not claim a live paid subscription flow was verified unless it was actually tested.

16. Monitoring Configuration

Review:

ACTION-018-error-monitoring-and-logging.md

Verify:

Production logs work
Error reporting works if configured
Sensitive data is sanitized
Monitoring environment is correctly identified

Do not expose monitoring secrets.

If no external monitoring provider is configured, ensure application logs remain usable.

17. Domain and HTTPS

Verify the production domain configuration.

Requirements:

HTTPS enabled
Valid TLS certificate
HTTP redirects to HTTPS where appropriate
No insecure production callback URLs

Do not claim DNS or TLS verification unless it was actually performed.

18. Security Headers

Verify production security configuration from:

ACTION-017-security-hardening.md

Review:

CSP
HSTS
X-Content-Type-Options
Referrer-Policy
Permissions-Policy
CORS

Ensure Shopify embedded-app functionality is not broken.

19. Production Secrets

Before deployment:

Review Git history/configuration for accidentally committed secrets.
Confirm production secrets exist only in the secure hosting environment.
Confirm .env files containing real secrets are not committed.

Never print secret values in the completion report.

If a secret was previously committed, report that rotation is required.

20. Git and Deployment State

Verify the repository is in a clean and understandable state.

Check:

git status

Review:

Uncommitted changes
Unexpected files
Generated files
Environment files
Debug files

Do not automatically delete developer files.

Do not commit secrets.

21. Node.js and Package Version

Verify the production runtime version.

Inspect:

package.json
engines
.nvmrc
hosting configuration

If the project requires a specific Node.js version, ensure the hosting environment matches it.

Do not perform a major Node.js upgrade during deployment unless required.

22. Production Build Configuration

Review:

next.config.*

and other build configuration.

Ensure:

Production settings are appropriate
Debug settings are disabled where necessary
Source maps/configuration do not expose secrets
Client bundles do not contain server-only credentials

Do not add unnecessary build complexity.

23. Health Check

Implement or verify a basic health check if appropriate.

Potential endpoint:

/api/health

The health check should verify application availability.

Where appropriate it may verify:

Application
Database connectivity

Do not expose:

Database credentials
Shopify secrets
Internal infrastructure details

Keep the response minimal.

24. Readiness vs Health

If the architecture supports it, distinguish:

Health

from:

Readiness

For example:

Health
→ Application process is running

Readiness
→ Application can safely serve traffic

Do not introduce a complex orchestration system just to implement these checks.

25. Production Smoke Tests

After deployment, perform smoke tests where access is available.

At minimum verify:

Application
Production URL loads
Authentication
Shopify OAuth flow
Dashboard
Dashboard loads
Database
Database connection works
Bundles
Create/read/update bundle
Products
Product data loads
Storefront
Bundle storefront experience loads
Webhooks
Webhook endpoint responds correctly
Billing
Billing flow is reachable
Discount
Discount function deployment/configuration is present

Only report tests that were actually performed.

26. Merchant Installation Test

If a development/test Shopify store is available, perform a complete installation test.

Flow:

Install App
 ↓
OAuth
 ↓
Dashboard
 ↓
Product Sync
 ↓
Create Bundle
 ↓
Publish Bundle
 ↓
Storefront
 ↓
Add Bundle
 ↓
Cart

Do not claim a merchant installation test without actually performing it.

27. Customer Purchase Flow

If a test store is available, verify:

Customer
 ↓
Bundle Landing Page
 ↓
Bundle Selection
 ↓
Variant Selection
 ↓
Add To Cart
 ↓
Discount
 ↓
Checkout

The test must use a safe test environment/store.

Do not use real customer/payment data.

Do not claim checkout verification unless it was actually performed.

28. Production Error Handling

After deployment verify that expected failures result in:

Safe error messages
Useful logs
No secret leakage
Correct HTTP status codes

Do not intentionally cause destructive production failures.

Use safe validation/error scenarios.

29. Deployment Rollback

Create a documented rollback strategy.

At minimum document:

Application rollback
Database migration considerations
Environment rollback
Shopify configuration rollback
Extension rollback

Important:

Do not automatically roll back database migrations without understanding data compatibility.

A database rollback may require a forward-compatible migration instead.

30. Deployment Documentation

Create/update a deployment document if the project does not already have one.

Recommended:

docs/15-DEPLOYMENT.md

It should document:

Prerequisites
Environment variables
Build command
Database migration process
Hosting configuration
Shopify configuration
Webhook configuration
Discount Function deployment
Storefront extension deployment
Health checks
Smoke tests
Rollback procedure

Use the actual project configuration.

Do not document hypothetical commands as if they were real.

31. Production Checklist

Create a final production checklist.

It should cover:

Code
Database
Environment
Shopify
OAuth
Webhooks
Storefront
Discount
Billing
Security
Monitoring
Performance
Testing
Backup/Recovery
Rollback
32. No Secret Exposure

Before final deployment, inspect generated/build output where practical for accidental exposure of:

Shopify API secret
Shopify access tokens
Database credentials
Session secrets
Monitoring secrets
Billing secrets

Do not print secrets during inspection.

33. Performance Verification

Use the results from:

ACTION-016-performance-optimization.md

Verify production deployment does not introduce obvious regressions.

Check:

Initial page load
API response
Storefront loading
Bundle loading
Dashboard loading

Do not claim exact performance numbers without measurement.

34. Security Verification

Use the results from:

ACTION-017-security-hardening.md

Verify production configuration preserves:

Authentication
Authorization
Tenant isolation
HMAC verification
Input validation
Secret protection
Security headers

Do not disable security controls to make deployment easier.

35. Logging Verification

Use:

ACTION-018-error-monitoring-and-logging.md

Verify:

Application logs are available
Errors are visible
Request IDs work where implemented
Sensitive data is not logged

Do not expose logs publicly.

36. Deployment Automation

If the existing hosting platform supports deployment automation, use the existing project configuration.

Do not create a complex CI/CD system unless needed.

At minimum, document:

Build
Test
Deploy
Migrate
Verify
Rollback
37. CI/CD Verification

If CI/CD already exists, verify that it runs appropriate checks.

Recommended checks:

Lint
Typecheck
Tests
Build

Do not make production deployment dependent on tests that do not actually exist.

38. Production Database Safety

Before applying production migrations:

Confirm database target.
Confirm migration files.
Confirm backup/recovery process where available.
Confirm migration is not destructive.
Confirm application compatibility.

Never execute:

prisma migrate reset

against production.

Never use destructive database commands merely to resolve deployment issues.

39. Deployment Validation Commands

Run the project's actual validation commands.

Attempt:

npm run lint
npm run typecheck
npm test
npm run build

Then use the actual deployment command for the configured hosting provider.

Do not invent deployment commands.

If deployment requires external credentials/access that are unavailable:

Document exactly what is missing.
Do not pretend deployment succeeded.
40. Final Verification Checklist

Before marking this action complete:

 Hosting architecture verified
 Production readiness audit completed
 Production build succeeds
 Environment variables documented
 Production secrets configured securely
 Database configured
 Prisma production configuration verified
 Production migrations reviewed
 Shopify app configuration verified
 OAuth URLs verified
 Webhook configuration verified
 Discount Function deployment reviewed
 Theme App Extension reviewed
 Billing configuration reviewed
 Monitoring configuration reviewed
 HTTPS verified where accessible
 Security headers reviewed
 Git state reviewed
 Runtime version verified
 Health endpoint verified/implemented
 Production smoke tests performed where possible
 Merchant installation tested where possible
 Customer purchase flow tested where possible
 Rollback procedure documented
 Deployment documentation created/updated
 Production checklist created
 Secret exposure audit performed
 Performance reviewed
 Security reviewed
 Logging reviewed
 CI/CD reviewed
 Database safety verified
 Lint checked
 Typecheck checked
 Tests checked
 Build checked
 Deployment result documented honestly
Important Restrictions

DO NOT:

Invent deployment success
Invent Shopify verification
Invent production test results
Expose production credentials
Print secrets
Reset the production database
Delete production data
Disable authentication
Disable security controls
Disable webhook verification
Disable billing protections
Introduce unrelated MVP features
Perform destructive migrations without explicit justification
Migrate hosting providers without architectural justification

If deployment credentials/access are missing, stop at the verification/documentation stage and report what is required.

Completion Report

When finished, provide:

1. Deployment Summary

Explain what was prepared/deployed.

2. Hosting

Report the actual hosting configuration.

3. Environment

Report:

Required Variables:
Configured:
Missing:

Never print secret values.

4. Database

Report:

Database:
Migration Status:
Connection Verification:

Use actual results.

5. Shopify Configuration

Report:

App URL:
OAuth:
Webhooks:
Discount Function:
Theme Extension:
Billing:

Only mark something verified if it was actually verified.

6. Security

Report production security verification.

7. Monitoring

Report logging/monitoring status.

8. Smoke Tests

List each test and actual result:

Application:
OAuth:
Dashboard:
Database:
Bundles:
Products:
Storefront:
Webhooks:
Billing:
Discount:

Use:

PASS
FAIL
NOT TESTED
BLOCKED

Do not guess.

9. Files Created

List every new file.

10. Files Modified

List every modified file.

11. Deployment Documentation

Report documentation created/updated.

12. Rollback

Summarize the rollback procedure.

13. Issues

List all unresolved deployment blockers or risks.

14. Validation

Report actual results:

Lint:
Typecheck:
Tests:
Build:
Deployment:
15. Next Action

After completing this action, the next planned action is:

ACTION-020-app-store-publish.md

Do not execute the next action automatically.
```
