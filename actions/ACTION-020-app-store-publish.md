# ACTION-020 — Shopify App Store Publishing

## Objective

Prepare the BundleCraft Shopify App for Shopify App Store submission and publishing.

This action must ensure that the application is production-ready, correctly configured for Shopify distribution, has complete App Store listing information, and passes the required internal QA checks before submission.

Do not claim that the app has been approved or published unless that actually happens.

---

# Required Documentation To Read First

Before starting implementation, read:

1. `CLAUDE.md`
2. `docs/01-PRD.md`
3. `docs/02-ARCHITECTURE.md`
4. `docs/03-TECH_STACK.md`
5. `docs/05-SHOPIFY_INTEGRATION.md`
6. `docs/07-AUTHENTICATION.md`
7. `docs/12-BILLING_SYSTEM.md`
8. `docs/13-SECURITY.md`
9. `docs/14-TESTING_STRATEGY.md`
10. `tasks/phase-10-testing/testing-strategy.md`
11. `actions/ACTION-003-shopify-authentication.md`
12. `actions/ACTION-007-discount-function.md`
13. `actions/ACTION-009-billing-system.md`
14. `actions/ACTION-017-security-hardening.md`
15. `actions/ACTION-019-production-deployment.md`

Also inspect the actual current implementation before making changes.

---

# Role

Act as a senior Shopify App Store launch engineer and SaaS release engineer.

Your responsibilities:

- Shopify App Store readiness
- Shopify Partner configuration readiness
- Production configuration verification
- App listing preparation
- Distribution configuration
- Billing readiness
- Privacy/security readiness
- Submission QA
- Final release validation

Do not introduce unrelated product features.

---

# Part 1 — Inspect Current Application

First inspect the complete project.

Verify:

- Next.js application
- Shopify integration
- Shopify OAuth
- Embedded app configuration
- Database
- Prisma
- Bundle engine
- Storefront widget
- Theme App Extension
- Shopify Discount Function
- Webhooks
- Product synchronization
- Analytics
- Billing
- Templates
- Theme customization
- Error monitoring
- Security hardening
- Production deployment configuration

Identify:

- Missing configuration
- Placeholder values
- Development-only URLs
- Localhost references
- Test credentials
- Debug code
- Unfinished TODOs
- Broken links
- Missing environment variables
- Missing production configuration
- Incorrect Shopify configuration

Do not assume something is complete simply because a documentation file says it is complete.

Inspect the actual implementation.

---

# Part 2 — Shopify App Configuration

Verify the Shopify app configuration used by the project.

Check:

- App URL
- Allowed redirection URLs
- OAuth callback URLs
- Embedded app configuration
- Shopify API configuration
- Required scopes
- Webhook configuration
- App extensions
- Theme App Extension
- Shopify Function
- Billing configuration
- Production domain
- HTTPS configuration

Ensure there are no development-only URLs in production configuration.

Example values such as:

```text
http://localhost:3000
http://127.0.0.1
localhost

must not remain in production configuration unless they are explicitly required for development-only configuration.

Do not expose:

Shopify access tokens
API secrets
database credentials
webhook secrets
environment secrets
Part 3 — Shopify App Store Listing Preparation

Prepare the application for the Shopify App Store listing.

The application is:

BundleCraft – Premium Bundle Builder for Shopify Brands

Use the PRD as the source of truth for the product positioning.

The listing should clearly communicate:

What BundleCraft does
Who it is for
Supported bundle types
Bundle templates
Storefront experience
Automatic discount functionality
Analytics
Customization
Ease of use
Supported pricing plans

The listing must remain consistent with the actual implemented product.

Do not advertise features that are not implemented.

Part 4 — App Listing Content

Prepare structured content for:

App Name

BundleCraft

Core Positioning

A Shopify bundle builder designed to help fashion and beauty brands create attractive product bundles and increase average order value.

Core Features

Document the implemented features such as:

Fixed Bundles
Quantity Bundles
Mix & Match Bundles
Fashion templates
Beauty templates
Product page bundle widget
Bundle landing page
Automatic bundle discounts
Storefront customization
Bundle analytics
Revenue tracking
Conversion tracking

Only include features that actually exist in the implementation.

Part 5 — Pricing Information

Ensure the App Store listing pricing is consistent with:

Free
Starter
Growth
Pro

Read:

docs/12-BILLING_SYSTEM.md

before preparing pricing information.

Verify:

Plan names
Pricing configuration
Feature limits
Billing implementation
Upgrade flow
Downgrade flow
Cancellation flow
Feature gates

Do not invent pricing values if they are not defined in the project documentation.

If pricing values are missing, clearly mark them as requiring merchant/business input instead of inventing them.

Part 6 — App Store Screenshots and Media

Prepare a checklist for required App Store media.

Potential assets include:

App icon
Dashboard screenshot
Bundle creation screenshot
Bundle customization screenshot
Storefront widget screenshot
Bundle landing page screenshot
Analytics screenshot
Billing/settings screenshot

Screenshots must:

Show the real application
Avoid placeholder content
Avoid development/debug information
Avoid exposing private merchant data
Use realistic demo data
Clearly demonstrate the application's functionality

Do not generate fake screenshots representing functionality that does not exist.

Part 7 — Demo / Test Store Preparation

Prepare a clean Shopify development/test store environment for validation.

Verify:

App can be installed
OAuth works
Merchant reaches dashboard
Products can be accessed
Bundle can be created
Bundle can be published
Storefront widget loads
Customer can select bundle products
Bundle can be added to cart
Discount behavior works
Analytics events are generated
Billing flow works according to the implemented billing system
App can be uninstalled
App can be reinstalled

Use test data only.

Never expose real merchant credentials.

Part 8 — Install / Reinstall / Uninstall Testing

Perform the following lifecycle test:

Installation
Install the application.
Complete Shopify authorization.
Verify shop/session creation.
Verify merchant reaches the dashboard.
Reinstallation
Uninstall the application.
Verify uninstall handling.
Reinstall the application.
Verify authentication works again.
Verify the merchant can access the application normally.
Data Isolation

Verify that one Shopify store cannot access:

Another store's bundles
Another store's analytics
Another store's subscription
Another store's products
Another store's configuration
Part 9 — Privacy and Legal Readiness

Inspect the application for required privacy/legal links and configuration.

Prepare placeholders/checklist for:

Privacy Policy
Terms of Service
Support page
Contact information
Data handling information

Do not invent legal URLs.

If the project does not contain these pages, clearly report them as release blockers requiring the business owner to provide or create them.

Part 10 — Shopify Data Handling Review

Review the application for Shopify merchant/customer data handling.

Check:

What data is stored
Why the data is stored
Where the data is stored
Access control
Token security
Data deletion handling
Uninstall handling
Webhook handling
Logs containing sensitive information

Ensure sensitive values are not written to logs.

Examples:

access tokens
API secrets
session secrets
database credentials
webhook secrets
customer-sensitive data

must never appear in normal application logs.

Part 11 — Production URL Verification

Verify that all production URLs are configured correctly.

Check:

Main application URL
OAuth callback URL
API endpoints
Webhook endpoints
Theme extension references
Function configuration
Billing callbacks
Support URL
Privacy URL
Terms URL

Search the repository for:

localhost
127.0.0.1
example.com
TODO
FIXME
CHANGE_ME
YOUR_
<YOUR_

Review every result.

Do not automatically replace values without understanding their purpose.

Part 12 — Environment Variable Audit

Verify that production environment variables exist for every required service.

Typical categories include:

SHOPIFY_API_KEY
SHOPIFY_API_SECRET
SHOPIFY_APP_URL
DATABASE_URL
DIRECT_URL
SESSION_SECRET
SHOPIFY_WEBHOOK_SECRET

Use the project's actual environment variable names as the source of truth.

Ensure:

.env is not committed
secrets are not hardcoded
.env.example contains names but not real secrets
production secrets are configured through the deployment platform
secrets are never printed in logs
Part 13 — App Functionality QA

Perform a complete end-to-end QA pass.

Merchant Flow

Test:

Install App
↓
Authenticate
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
Publish
↓
View Bundle
Customer Flow

Test:

Open Product Page
↓
View Bundle Widget
↓
Select Products/Variants
↓
Add Bundle
↓
Cart
↓
Discount
↓
Purchase
↓
Analytics
Analytics Flow

Verify:

bundle_view
bundle_add
bundle_purchase

are correctly recorded where applicable.

Part 14 — Billing QA

Verify:

Current subscription can be detected
Plan information is correct
Feature limits work
Upgrade flow works
Downgrade flow works
Cancellation behavior works
Free plan behavior works
Paid plan behavior works

Do not claim production billing approval unless it has actually been verified.

Part 15 — Security QA

Review the final application against:

docs/13-SECURITY.md

Verify:

Authentication
Authorization
Multi-tenant isolation
Input validation
XSS protection
CSRF protection where applicable
CORS configuration
Security headers
CSP where applicable
Secure cookies/session handling
Webhook HMAC verification
Rate limiting
Secret management
Safe error responses
Safe logging
Dependency security

Run dependency/security checks available in the project.

Part 16 — Production Build Validation

Run the project's actual validation commands.

At minimum, where supported:

npm run lint
npm run typecheck
npm test
npm run build

Also run any project-specific:

Prisma validation
Prisma migration checks
Shopify extension validation
Shopify Function build
E2E tests

Do not claim success unless the command actually succeeds.

If a command does not exist, report that clearly.

Part 17 — App Store Submission Checklist

Create a final checklist covering:

Technical
 Production deployment complete
 Production domain configured
 OAuth configured
 Webhooks configured
 Theme App Extension configured
 Shopify Function configured
 Billing configured
 Database configured
 Monitoring configured
 Error handling configured
Product
 Bundle creation works
 Fixed Bundle works
 Quantity Bundle works
 Mix & Match works
 Templates work
 Storefront widget works
 Bundle landing page works
 Customization works
 Analytics works
 Billing works
Security
 OAuth secure
 Session secure
 Multi-tenant isolation verified
 Webhook verification verified
 Secrets protected
 Sensitive logging removed
 Dependency audit completed
Listing
 App name
 App description
 Feature description
 Pricing information
 Screenshots
 App icon
 Support information
 Privacy policy
 Terms information
 Demo/test information
Part 18 — Shopify Partner Dashboard Preparation

Prepare the project for the Shopify Partner Dashboard submission process.

Verify the information required by the actual Shopify Partner Dashboard at the time of submission.

Do not hardcode or invent requirements that are not visible in the current Shopify submission workflow.

The final implementation should provide the necessary production values and documentation so the app owner can complete the Partner Dashboard submission.

Part 19 — Submission Safety

Do NOT:

Submit an unfinished app
Publish an untested build
Expose secrets
Use fake merchant data
Leave localhost URLs
Claim approval without approval
Claim App Store publication without publication
Automatically change production billing configuration without confirmation
Delete production database data
Perform destructive migrations
Remove working functionality

If Shopify Partner Dashboard access or human approval is required, stop and report the exact manual step.

Part 20 — Final Release Report

After completing the action, provide a detailed report containing:

1. App Store Readiness
READY
NOT READY
BLOCKED

Use the actual state.

2. Completed Work

List every implemented change.

3. Files Changed

Provide:

file path
purpose

for each important changed file.

4. Validation Results

Report actual results:

Lint:
Typecheck:
Tests:
Build:
Shopify validation:
Security audit:
E2E:

Do not fabricate results.

5. Release Blockers

List anything preventing submission.

For example:

Missing Privacy Policy URL
Missing Terms URL
Production Shopify configuration incomplete
Billing configuration incomplete
App Store media missing
6. Manual Shopify Partner Dashboard Steps

Clearly separate actions that must be completed manually by the app owner.

7. Final Recommendation

Do not provide a subjective ranking.

Instead state one of:

Ready for submission
Needs fixes before submission
Blocked by external/manual requirements

based strictly on the actual validation results.

Important Rules
Read all required documentation before changing code.
Inspect the actual implementation.
Do not assume undocumented features exist.
Do not invent Shopify App Store requirements.
Do not expose secrets.
Do not claim successful App Store approval without real approval.
Do not claim publication without real publication.
Do not submit the app automatically unless explicitly authorized and the required access is available.
Do not introduce future roadmap features.
Do not perform destructive production operations.
Preserve multi-tenant architecture.
Keep the implementation production-ready.
Update relevant documentation if implementation changes.
Report actual validation results only.
If a requirement cannot be verified automatically, clearly mark it for manual verification.
Definition of Done

ACTION-020 is complete when:

The production application has been inspected.
Shopify configuration has been reviewed.
App Store listing content has been prepared.
Pricing/listing consistency has been checked.
App Store media requirements have been identified.
Install/reinstall/uninstall flows have been tested where possible.
Merchant and customer flows have been tested.
Billing has been validated where possible.
Security has been reviewed.
Production environment variables have been audited.
Production URLs have been audited.
Repository placeholders have been reviewed.
Production build has been validated.
App Store submission blockers have been documented.
Manual Shopify Partner Dashboard steps have been documented.
Final release status has been reported using actual evidence.

Do not claim the application is published unless it has actually been published to the Shopify App Store.

This is the final action in the current 20-action implementation plan.
```
