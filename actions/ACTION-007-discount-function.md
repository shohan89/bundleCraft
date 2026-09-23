# ACTION-007 — Shopify Discount Function Implementation

## Objective

Implement the BundleCraft discount system using Shopify Functions.

The purpose of this action is to connect BundleCraft bundle discount configuration with Shopify's discount execution layer.

The MVP must support:

- Percentage discount
- Fixed amount discount
- Bundle-aware discount application
- Validation of bundle-related cart conditions
- Secure discount execution
- Integration with the Bundle Engine

This action must use the bundle and cart information already established by previous actions.

Do not implement analytics, billing, or new storefront UI in this action.

---

# Required Documentation To Read First

Before starting implementation, read the following files completely:

1. `CLAUDE.md`
2. `docs/01-PRD.md`
3. `docs/02-ARCHITECTURE.md`
4. `docs/04-DATABASE_DESIGN.md`
5. `docs/05-SHOPIFY_INTEGRATION.md`
6. `docs/06-API_SPECIFICATION.md`
7. `docs/09-BUNDLE_ENGINE.md`
8. `docs/13-SECURITY.md`
9. `tasks/phase-07-discount/discount-function.md`

Also inspect:

```text
ACTION-001
ACTION-002
ACTION-003
ACTION-004
ACTION-005
ACTION-006

Do not duplicate existing functionality.

Role

Act as a senior Shopify app engineer specializing in:

Shopify Functions
Shopify discount architecture
TypeScript
Shopify GraphQL APIs
Ecommerce cart logic
Secure multi-tenant SaaS applications

Build the discount system as a production-quality Shopify integration.

1. Discount Architecture

The expected high-level flow is:

Merchant creates bundle
        ↓
Bundle Engine stores discount configuration
        ↓
Bundle is published
        ↓
Discount configuration is made available to Shopify
        ↓
Shopify Discount Function executes
        ↓
Customer adds eligible bundle products
        ↓
Shopify evaluates discount
        ↓
Eligible cart items receive bundle discount

Shopify remains responsible for executing the actual checkout/cart discount.

BundleCraft is responsible for defining and managing the bundle discount configuration.

2. Supported Discount Types

The MVP supports:

Percentage Discount
Fixed Amount Discount

Examples:

10% off

or:

$15 off

The implementation must preserve the discount configuration stored by the Bundle Engine.

3. Discount Configuration

The discount configuration should be associated with the bundle.

Conceptually:

Bundle
├── Bundle Type
├── Products
├── Required Quantity
├── Discount Type
├── Discount Value
└── Status

Do not create a second independent bundle configuration system.

The Bundle Engine remains the source of bundle configuration.

4. Shopify Function

Implement the Shopify discount Function according to the Shopify integration architecture already established in the project.

The Function should:

Receive Shopify cart context.
Identify eligible cart items.
Determine whether the cart satisfies bundle requirements.
Determine the applicable bundle discount.
Return the appropriate Shopify discount operation.
Avoid applying discounts to unrelated cart items.

Do not implement discount calculations exclusively in browser-side JavaScript.

The actual discount enforcement must occur server-side through Shopify's supported discount mechanism.

5. Bundle Identification

The discount system needs a reliable way to associate cart items with a BundleCraft bundle.

Use the bundle identification approach already established in:

docs/08-STOREFRONT_WIDGET.md
docs/09-BUNDLE_ENGINE.md

Where supported, use bundle-related cart metadata such as:

bundle_id
bundle_instance_id
bundle_type

Do not trust arbitrary customer-supplied discount values.

The discount value must come from trusted BundleCraft configuration.

6. Bundle Eligibility

Before applying a discount, determine whether the cart satisfies the bundle requirements.

Eligibility may include:

Bundle is active
Bundle exists
Required products are present
Required quantity is satisfied
Bundle selection is valid
Cart items belong to the same bundle instance

If eligibility fails:

Do not apply the bundle discount.
7. Fixed Bundle Discount

For Fixed Bundles:

Bundle
├── Product A
├── Product B
└── Product C

The Function should determine whether the eligible bundle products are present in the cart.

If the bundle is valid:

Apply configured discount

If the bundle is incomplete:

Do not apply the bundle discount

Do not discount unrelated products.

8. Quantity Bundle Discount

For Quantity Bundles:

Choose 3 products
10% off

The Function should verify that the required quantity condition is satisfied before applying the discount.

Example:

Required quantity: 3

Cart selection:
Product A
Product B
Product C

Eligible:

Yes

If only two eligible products are present:

No discount

Do not partially apply a bundle discount unless the bundle configuration explicitly supports such behavior.

9. Mix & Match Discount

For Mix & Match:

Choose any 3
15% off

The Function should verify that:

Eligible products are present.
Required quantity is satisfied.
Products belong to the correct bundle.
The bundle is active.

Only eligible bundle products should receive the configured discount.

10. Percentage Discount

Implement percentage-based discounts.

Example:

Discount type:
percentage

Discount value:
10

The Function should apply the configured percentage discount to eligible bundle items.

Validate the discount configuration before creating/updating the Shopify discount configuration.

11. Fixed Amount Discount

Implement fixed-amount discount support.

Example:

Discount type:
fixed_amount

Discount value:
15

The Function should apply the configured fixed amount according to Shopify's supported discount behavior.

Do not assume that a fixed discount can be applied identically to every individual cart item.

Respect Shopify's discount semantics and the bundle's intended behavior.

12. Discount Scope

The discount must apply only to eligible bundle products.

Do not apply a BundleCraft discount to:

Unrelated products
Other bundles
Non-eligible cart items
Products that do not satisfy bundle conditions

Example:

Cart

Bundle Product A
Bundle Product B
Bundle Product C

Regular Product X

Only the eligible bundle products should be considered for the BundleCraft discount.

13. Multiple Bundles In One Cart

Design the Function so that it does not incorrectly combine unrelated bundles.

For example:

Bundle A
Product A
Product B
Product C

Bundle B
Product D
Product E
Product F

The Function must preserve bundle boundaries.

Do not treat all products in the cart as one bundle.

If the current MVP does not support multiple simultaneous bundle instances, document that limitation clearly rather than inventing unsupported behavior.

14. Bundle Instance Handling

If the storefront creates a bundle instance identifier, use it where appropriate.

Example:

bundle_id:
bundle_123

bundle_instance_id:
instance_456

This helps distinguish:

Bundle A instance 1
Bundle A instance 2

when supported by the implementation.

Do not generate inconsistent identifiers between the storefront and discount system.

15. Discount Lifecycle

The discount lifecycle should follow the bundle lifecycle.

Conceptually:

Bundle Draft
    ↓
No active discount

Bundle Active
    ↓
Discount available

Bundle Inactive
    ↓
Discount unavailable

When a bundle is deactivated, the discount should no longer apply to new eligible cart activity according to the implemented Shopify discount lifecycle.

Do not leave orphaned active discount configurations without a clear relationship to their BundleCraft bundle.

16. Shopify Discount Configuration

Where required by the Shopify architecture, create/update the corresponding Shopify discount configuration when a bundle is published or its discount settings change.

The exact implementation must follow the Shopify APIs and Function configuration already used by the project.

Do not create duplicate Shopify discounts unnecessarily.

If an existing BundleCraft discount configuration exists, update it rather than creating an uncontrolled duplicate.

17. Bundle-to-Shopify Discount Mapping

Maintain a reliable relationship between:

BundleCraft Bundle
        ↓
Shopify Discount Configuration
        ↓
Shopify Function

Store the necessary Shopify identifier/reference using the project's existing database architecture.

If the existing schema does not contain the required field, inspect the current architecture before modifying it.

Do not silently introduce an unrelated data model.

18. API Integration

Use the existing API architecture.

If bundle publishing requires a backend operation to synchronize the Shopify discount configuration, keep that operation server-side.

Possible conceptual flow:

POST /api/bundles/:id/publish
        ↓
Validate bundle
        ↓
Create/update Shopify discount
        ↓
Activate bundle

The exact endpoint structure must remain consistent with:

docs/06-API-SPECIFICATION.md

Do not create conflicting API patterns.

19. Authentication

All merchant-side discount management operations must require authenticated Shopify merchant context.

Never trust:

shopId
accessToken
bundle ownership
discount ownership

from the browser.

Determine the merchant/shop from the authenticated session.

20. Access Token Security

Shopify Admin API access tokens must remain server-side.

Never expose tokens through:

Browser JavaScript
Theme App Extension
Storefront API response
HTML
Logs
API response
Client-side environment variables

Use the existing secure token storage architecture.

21. Multi-Tenant Isolation

Every discount configuration operation must be scoped to the authenticated Shopify shop.

Example:

Shop A
    ↓
Bundle A
    ↓
Shopify Discount A

Shop A must never be able to modify:

Shop B
Bundle B
Discount B

Test this explicitly.

22. Error Handling

Handle errors such as:

SHOPIFY_API_ERROR
DISCOUNT_CREATE_FAILED
DISCOUNT_UPDATE_FAILED
DISCOUNT_NOT_FOUND
BUNDLE_NOT_FOUND
BUNDLE_INACTIVE
INVALID_BUNDLE
INVALID_DISCOUNT
UNAUTHORIZED
FORBIDDEN

Customer-facing errors should be safe and understandable.

Merchant dashboard errors should provide useful but non-sensitive information.

Never expose:

Access tokens
GraphQL credentials
Database credentials
Internal stack traces
23. Idempotency

Discount synchronization must be safe to retry.

Avoid creating duplicate Shopify discounts if:

Publish operation

is triggered multiple times.

Use the stored Shopify discount identifier/reference where available.

Conceptual flow:

Does Bundle already have Shopify discount?
        ↓
Yes → Update/reuse
        ↓
No → Create

The exact implementation must follow the project's architecture.

24. Bundle Update

If a merchant changes:

Discount type
Discount value
Bundle products
Required quantity
Bundle status

the associated Shopify discount configuration should be synchronized when required.

Do not leave the Shopify discount configuration inconsistent with the published BundleCraft configuration.

25. Bundle Deactivation

When a bundle becomes inactive:

Bundle status
    ↓
inactive

ensure the associated discount is no longer incorrectly applied.

Use the Shopify-supported lifecycle mechanism appropriate for the implementation.

Do not delete the entire Shopify discount configuration unless the architecture explicitly requires deletion.

Prefer a controlled lifecycle.

26. Function Performance

Shopify Functions must remain lightweight.

Avoid:

Large unnecessary dependencies
Network requests from the Function where not supported
Complex database access
Unnecessary calculations
Large payloads

The Function should use the data available through its Shopify input/query configuration.

Do not design the Function around unsupported runtime behavior.

27. Function Input

Configure the Function input/query to request only the data required for discount evaluation.

Potential information may include:

Cart lines
Product/variant identifiers
Quantities
Cart attributes/metafields where supported
Discount configuration data available to the Function

Do not request unnecessary Shopify data.

Follow the Shopify Function input schema supported by the project's configured API version.

28. Function Output

Return the appropriate Shopify discount operation according to the configured discount behavior.

The implementation should:

Apply discounts only to eligible items.
Respect discount type.
Respect discount value.
Avoid invalid discount operations.
Handle no-match scenarios safely.

If no eligible bundle exists:

Return no discount.
29. Logging

Use safe server-side logging for:

Discount synchronization failures
Shopify API failures
Function deployment/configuration issues
Invalid bundle configuration

Never log:

Shopify access tokens
API secrets
Database passwords
Customer sensitive information

Use structured logs where the existing project supports them.

30. Testing Strategy

Create unit tests for the discount logic.

Test:

Fixed Bundle
Complete bundle receives discount
Incomplete bundle receives no discount
Unrelated product is not discounted
Quantity Bundle
Required quantity met
Required quantity not met
Extra unrelated products ignored
Mix & Match
Valid selection receives discount
Invalid selection receives no discount
Required quantity enforced
Percentage
Correct percentage configuration
Invalid percentage rejected
Fixed Amount
Correct fixed amount configuration
Invalid fixed amount rejected
Bundle Status
Active bundle eligible
Draft bundle not eligible
Inactive bundle not eligible
31. Multi-Tenant Tests

Explicitly test:

Shop A cannot modify Shop B discount.
Shop A cannot publish Shop B bundle.
Shop A cannot deactivate Shop B bundle.
Shop A cannot access Shop B Shopify discount configuration.

This is mandatory.

32. Idempotency Tests

Test:

Publish same bundle twice

Expected behavior:

No duplicate uncontrolled Shopify discounts.

Also test:

Update bundle discount

and confirm the correct Shopify discount configuration is updated/reconciled.

33. Integration Tests

Where Shopify test infrastructure is available, test:

Bundle creation
        ↓
Bundle publish
        ↓
Shopify discount synchronization
        ↓
Customer cart eligibility
        ↓
Discount execution

If a complete live Shopify environment is not available, create the appropriate mocked/integration test boundary and clearly report the limitation.

Do not claim live Shopify verification if it was not performed.

34. Do NOT Implement In This Action

Do NOT implement:

Analytics engine
Analytics dashboard
Billing
Subscription management
New storefront widget
New bundle types
BOGO bundles
Volume discounts
Gift bundles
Multi-currency
Multilingual support
B2B pricing
Wholesale features

These belong to future phases or the existing roadmap.

35. Expected Files

The exact file structure depends on the existing project.

Potential structure:

extensions/
└── bundle-discount/
    ├── src/
    │   ├── index.ts
    │   ├── bundle.ts
    │   ├── discount.ts
    │   └── validation.ts
    ├── shopify.extension.toml
    └── package.json

Backend synchronization may include:

lib/
└── shopify/
    └── discounts/
        ├── discount.service.ts
        ├── discount.types.ts
        └── discount.errors.ts

Use the existing project structure where available.

Do not create duplicate Shopify extension configurations.

36. Implementation Rules

Before changing code:

Inspect the current repository.
Read all required documentation.
Inspect the Shopify app configuration.
Inspect the existing Bundle Engine.
Inspect the existing storefront implementation.
Inspect the Prisma schema.
Inspect Shopify API utilities.
Inspect authentication/session handling.
Reuse existing utilities.
Do not rewrite unrelated code.
37. Shopify API Compatibility

Use the Shopify API version already configured by the project.

Do not arbitrarily introduce a different API version.

If the implementation requires a Shopify feature not supported by the current configuration:

Identify the requirement.
Check the project's existing configuration.
Make the minimum necessary compatible change.
Document the change in the completion report.

Do not silently change the entire Shopify integration architecture.

38. TypeScript Requirements

Use strict TypeScript.

Avoid:

any

unless absolutely necessary.

Create explicit types for:

DiscountType
DiscountConfig
BundleEligibility
DiscountResult
ShopifyDiscountReference
DiscountSyncResult

Keep types consistent between the backend and Function where practical.

39. Security Checklist

Before completion verify:

 Shopify access tokens remain server-side
 Discount operations require merchant authentication
 Bundle ownership is verified
 Shop isolation is enforced
 Customer cannot control discount value
 Customer cannot activate an inactive bundle
 No secrets are exposed
 No sensitive information is logged
 Shopify discount references are protected
40. Validation Checklist

Before completing this action:

Discount Types
 Percentage discount supported
 Fixed amount discount supported
Bundle Types
 Fixed Bundle supported
 Quantity Bundle supported
 Mix & Match supported
Eligibility
 Active bundle required
 Required products validated
 Required quantity validated
 Unrelated products excluded
Shopify Integration
 Shopify Function configured
 Discount synchronization implemented
 Shopify discount reference handled
 Duplicate discount creation prevented
Security
 Merchant isolation works
 Access token remains private
 Unauthorized operations blocked
Testing
 Unit tests pass
 Integration tests pass where available
 TypeScript passes
 Lint passes
 Build passes
41. Final Verification Commands

Run only commands that actually exist in the project.

Possible commands:

npm run lint
npm run typecheck
npm test
npm run build

If the project contains Shopify-specific validation/build commands, run the appropriate existing commands.

Do not invent commands.

42. Completion Report

After implementation, provide a concise report containing:

Summary

Explain what was implemented.

Discount Types

Confirm:

Percentage discount
Fixed amount discount
Bundle Types

Confirm support for:

Fixed Bundle
Quantity Bundle
Mix & Match
Shopify Function

Explain:

Function created
Input/query configuration
Discount logic
Eligibility logic
Output behavior
Shopify Discount Synchronization

Explain how BundleCraft bundles are mapped to Shopify discount configurations.

Database Changes

List any Prisma/schema changes.

If none were required, explicitly state that.

Security

Explain:

Merchant isolation
Token security
Bundle ownership validation
Tests

Report:

Unit tests
Integration tests
TypeScript
Lint
Build
Shopify validation
Limitations

Clearly state anything that could not be verified because a live Shopify environment or required Shopify configuration was unavailable.

Do not claim live Shopify discount execution was verified unless it actually was.

Next Action

The next implementation phase is:

ACTION-008 — Analytics System

Do not start ACTION-008 automatically.

Wait for explicit instruction before implementing the next action.
```
