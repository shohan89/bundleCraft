# ACTION-005 — Bundle Engine Implementation

## Objective

Implement the core Bundle Engine for BundleCraft.

The Bundle Engine is responsible for creating, updating, validating, publishing, and managing merchant bundles.

The MVP must support:

- Fixed Bundle
- Quantity Bundle
- Mix & Match Bundle

The implementation must use the existing database architecture, authentication system, API structure, and merchant dashboard.

This action focuses on the backend bundle business logic and its API integration.

Do not implement the storefront widget, Shopify Functions discount execution, analytics tracking engine, or billing system in this action.

---

# Required Documentation To Read First

Before starting implementation, read the following files completely:

1. `CLAUDE.md`
2. `docs/01-PRD.md`
3. `docs/02-ARCHITECTURE.md`
4. `docs/04-DATABASE_DESIGN.md`
5. `docs/06-API_SPECIFICATION.md`
6. `docs/09-BUNDLE_ENGINE.md`
7. `tasks/phase-05-bundle-engine/bundle-system.md`

Also inspect the existing implementation from:

```text
ACTION-001
ACTION-002
ACTION-003
ACTION-004

Do not duplicate existing functionality.

Role

Act as a senior backend/full-stack engineer specializing in:

Next.js
TypeScript
PostgreSQL
Prisma
Shopify SaaS applications
Multi-tenant architecture
Business logic design
REST API design

Build the Bundle Engine as a clean, maintainable service layer.

1. Bundle Engine Responsibilities

The Bundle Engine should handle:

Bundle Creation
Bundle Retrieval
Bundle Update
Bundle Deletion
Bundle Validation
Bundle Publishing
Bundle Activation
Bundle Deactivation
Product Association
Discount Configuration
Bundle Status Management

The engine must remain independent from the presentation layer.

Do not place complex business logic directly inside React components or API route handlers.

2. Supported Bundle Types

The MVP supports three bundle types.

Fixed Bundle

A predefined group of products sold together.

Example:

Complete Look

T-Shirt
Jeans
Shoes

The merchant defines the products included in the bundle.

Quantity Bundle

A bundle based on a required quantity.

Example:

Choose 3 products
10% discount

The merchant defines the quantity requirement.

Mix & Match Bundle

Customers can select products from a defined collection/group of products.

Example:

Choose any 3 products
Get 15% off

The merchant defines:

Available products
Required quantity
Discount configuration
3. Bundle Status

The Bundle Engine must support:

draft
active
inactive

Recommended lifecycle:

Draft
  ↓
Active
  ↓
Inactive

A bundle can be edited while in draft.

Publishing should validate the bundle before changing it to active.

Deactivation should change the bundle to inactive without deleting it.

4. Multi-Tenant Security

This is a critical requirement.

Every bundle belongs to a specific Shopify shop.

The system must never allow one merchant to access another merchant's bundles.

Every database query must be scoped by the authenticated shop.

Conceptually:

Authenticated Shop
        ↓
Shop ID
        ↓
Bundle Query
        ↓
Only bundles belonging to that shop

Never trust a shopId sent directly by the frontend.

Determine the shop identity from the authenticated session.

5. Bundle Creation

Implement a service responsible for creating bundles.

Example conceptual interface:

createBundle(input, shopContext)

The service should:

Validate authentication.
Determine the authenticated shop.
Validate bundle input.
Validate bundle type.
Validate products.
Validate discount configuration.
Create the bundle.
Create associated bundle products.
Create customization data when provided.
Return the created bundle.

The operation must be atomic.

Use a Prisma transaction where multiple database records are created together.

6. Bundle Input Validation

Validate all incoming bundle data.

At minimum validate:

Bundle name
Bundle type
Products
Quantity requirements
Discount type
Discount value
Status
Customization

Reject invalid values.

Examples of invalid data:

Empty bundle name
Invalid bundle type
Negative discount
Invalid discount type
Zero products when products are required
Invalid quantity
Invalid status
Malformed product/variant identifiers

Use the project's existing validation approach.

If no validation library exists, use a clean typed validation layer rather than scattering validation across API routes.

7. Bundle Types Validation

Validate rules according to bundle type.

Fixed Bundle

Requirements:

Bundle name
At least one product
Valid product/variant references
Quantity Bundle

Requirements:

Bundle name
Products
Required quantity
Valid discount configuration

Required quantity must be greater than zero.

Mix & Match

Requirements:

Bundle name
Available products
Required selection quantity
Valid discount configuration

Required quantity must be greater than zero.

8. Product and Variant Association

Use the existing BundleProduct model defined in the database design.

A bundle can contain multiple products.

Store the relationship using the existing database schema.

Do not create a second product relationship system.

The Bundle Engine should support:

Add product
Remove product
Update product quantity/order where supported
Retrieve bundle products

Respect the existing database schema.

If the schema does not contain a field required for a specific feature, do not silently redesign the database.

Document the limitation instead.

9. Shopify Product Validation

When product/variant information is received from the merchant dashboard, validate it according to the existing Shopify integration architecture.

Do not blindly trust frontend product information.

The backend should verify product references where the current Shopify integration supports verification.

Do not expose Shopify access tokens to the frontend.

10. Discount Configuration

The Bundle Engine must support:

Percentage Discount
Fixed Amount Discount

Example:

10%

or:

$10

Validate discount values.

Percentage discounts must use valid percentage ranges.

Fixed discounts must be positive values.

Do not implement the actual Shopify discount execution in this action.

The Shopify discount execution will be handled by:

ACTION-007 — Discount Function

The Bundle Engine should only store and validate the bundle's discount configuration.

11. Bundle Update

Implement bundle update functionality.

Example conceptual interface:

updateBundle(bundleId, input, shopContext)

The service must:

Authenticate the merchant.
Verify bundle ownership.
Validate incoming data.
Update bundle fields.
Synchronize associated products.
Update customization data when applicable.
Return the updated bundle.

Never update a bundle solely by ID.

Always verify:

bundle.id
AND
bundle.shopId === authenticatedShop.id
12. Bundle Retrieval

Implement:

Get all bundles for current shop
Get single bundle for current shop

Example conceptual methods:

getBundles(shopContext)
getBundleById(bundleId, shopContext)

The response should include relevant bundle information and associated products where required.

Never return bundles belonging to another shop.

13. Bundle Deletion

Implement bundle deletion.

Before deleting:

Verify authentication.
Verify bundle ownership.
Check whether the bundle can be safely deleted.
Delete associated records according to the existing database relationships.

Respect foreign-key and cascading behavior defined in Prisma.

Do not delete Shopify products.

Deleting a BundleCraft bundle must not delete the merchant's Shopify products.

14. Draft Bundle

Merchants should be able to save an incomplete bundle as:

draft

A draft may be incomplete depending on the product workflow.

However, the system must distinguish between:

Draft validation
Publish validation

A draft can contain incomplete configuration when the dashboard workflow requires progressive setup.

A bundle must pass all required validation before publishing.

15. Publish Bundle

Implement a publish operation.

Example:

publishBundle(bundleId, shopContext)

Publishing must:

Verify authentication.
Verify bundle ownership.
Load the complete bundle.
Validate the bundle.
Validate required products.
Validate discount configuration.
Validate required bundle settings.
Change status to active.
Return the published bundle.

If validation fails:

Do not publish.
Return structured validation errors.

Do not partially publish a bundle.

16. Activate Bundle

Implement activation where appropriate.

Conceptually:

activateBundle(bundleId, shopContext)

The operation must verify the bundle before activation.

Only a valid bundle should become active.

17. Deactivate Bundle

Implement:

deactivateBundle(bundleId, shopContext)

This should change the bundle status to:

inactive

Do not delete the bundle.

The merchant should be able to manage the bundle again later.

18. Bundle Validation Service

Create a centralized bundle validation service.

Suggested conceptual structure:

BundleValidator

or:

validateBundle()

It should validate:

General bundle information
Bundle type
Products
Quantities
Discount
Customization
Publish requirements

Avoid duplicating the same validation rules in multiple API routes.

19. Bundle Service Layer

Keep business logic in a dedicated service layer.

Suggested architecture:

API Route
   ↓
Authentication
   ↓
Bundle Service
   ↓
Bundle Validator
   ↓
Prisma
   ↓
PostgreSQL

Example conceptual structure:

lib/
├── bundles/
│   ├── bundle.service.ts
│   ├── bundle.validation.ts
│   ├── bundle.types.ts
│   └── bundle.errors.ts

Adapt the structure to the existing project.

Do not create unnecessary layers.

20. API Endpoints

Implement the bundle API according to:

docs/06-API-SPECIFICATION.md

At minimum support:

GET    /api/bundles
POST   /api/bundles
GET    /api/bundles/:id
PUT    /api/bundles/:id
DELETE /api/bundles/:id

Also implement appropriate publish/status endpoints if they fit the existing API architecture.

Possible structure:

POST /api/bundles/:id/publish
POST /api/bundles/:id/activate
POST /api/bundles/:id/deactivate

Use the existing API conventions in the project.

Do not create conflicting endpoint patterns.

21. API Response Structure

API responses should be predictable and consistent.

Success example:

{
  "success": true,
  "data": {}
}

Validation error example:

{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Bundle validation failed",
    "details": []
  }
}

Use the project's existing API response conventions if already established.

Do not create multiple incompatible response formats.

22. Error Handling

Create meaningful error types where appropriate.

Possible errors:

BUNDLE_NOT_FOUND
UNAUTHORIZED
FORBIDDEN
VALIDATION_ERROR
INVALID_BUNDLE_TYPE
INVALID_DISCOUNT
INVALID_QUANTITY
INVALID_PRODUCT
BUNDLE_ALREADY_ACTIVE
BUNDLE_CANNOT_BE_PUBLISHED

Do not expose:

Database internals
Stack traces
Shopify access tokens
Environment variables
Sensitive implementation details

to the frontend.

23. Dashboard Integration

Inspect:

ACTION-004 — Merchant Dashboard

The existing Create Bundle wizard should be connected to the Bundle Engine APIs where appropriate.

The dashboard should be able to:

Create Draft
Update Draft
Retrieve Bundle
Save Products
Save Discount
Save Customization
Publish Bundle

Do not duplicate business logic inside dashboard components.

The dashboard should call the backend service/API.

24. Database Transactions

Use Prisma transactions whenever a bundle operation modifies multiple related records.

Examples:

Create Bundle
    +
Create Bundle Products
    +
Create Customization

or:

Update Bundle
    +
Update Products
    +
Update Customization

The operation should either complete successfully or roll back.

Avoid partially saved bundle states caused by failed multi-step database operations.

25. Concurrency and Data Integrity

Avoid race conditions where practical.

Before updating or publishing a bundle:

Confirm the bundle still exists.
Confirm the bundle belongs to the authenticated shop.
Validate the latest state.

Do not assume frontend state is always current.

26. Testing

Create unit tests for the Bundle Engine.

At minimum test:

Creation
Valid Fixed Bundle
Valid Quantity Bundle
Valid Mix & Match Bundle
Invalid bundle type
Missing name
Missing products
Invalid discount
Invalid quantity
Retrieval
Get merchant bundles
Get single bundle
Bundle not found
Cross-shop access blocked
Update
Update bundle
Update products
Update discount
Unauthorized update
Cross-shop update blocked
Publishing
Valid bundle publishes
Invalid bundle cannot publish
Draft remains draft when validation fails
Status
Activate bundle
Deactivate bundle
Invalid activation prevented where applicable
Deletion
Delete owned bundle
Prevent unauthorized deletion
27. Multi-Tenant Security Tests

Explicitly test that:

Shop A cannot access Shop B bundles.

Test this for:

GET
PUT
DELETE
PUBLISH
ACTIVATE
DEACTIVATE

This is a mandatory security requirement.

28. Performance Considerations

Avoid unnecessary database queries.

Use Prisma relations appropriately.

Avoid:

N+1 queries

where practical.

Use database indexes already defined in:

docs/04-DATABASE_DESIGN.md

Do not add speculative indexes without a clear reason.

29. Do NOT Implement In This Action

Do NOT implement:

Storefront widget
Theme App Extension
Shopify cart integration
Shopify Functions
Automatic discount execution
Analytics event tracking
Analytics dashboard calculations
Shopify subscription billing
Billing plans
Customer-facing bundle UI

Those belong to later actions.

30. Expected Files

The exact structure depends on the existing project.

Potential files:

lib/
└── bundles/
    ├── bundle.service.ts
    ├── bundle.validation.ts
    ├── bundle.types.ts
    └── bundle.errors.ts

app/
└── api/
    └── bundles/
        ├── route.ts
        └── [id]/
            ├── route.ts
            ├── publish/
            │   └── route.ts
            ├── activate/
            │   └── route.ts
            └── deactivate/
                └── route.ts

Only create the files required by the actual project architecture.

31. Implementation Rules

Before modifying the code:

Inspect the current repository.
Read all required documentation.
Inspect the Prisma schema.
Inspect the authentication/session implementation.
Inspect the existing dashboard implementation.
Inspect existing API utilities.
Reuse existing validation utilities.
Reuse existing error handling.
Reuse existing database utilities.
Do not create duplicate infrastructure.

Do not rewrite unrelated parts of the project.

32. TypeScript Requirements

Use strict TypeScript.

Avoid:

any

unless absolutely unavoidable.

Use explicit types for:

Bundle input
Bundle output
Bundle type
Bundle status
Discount configuration
Product associations
Service results
API responses
Errors

Keep frontend and backend types consistent where practical.

33. Security Checklist

Before completion verify:

 Authentication is required
 Shop identity comes from authenticated session
 Bundle ownership is verified
 Cross-shop access is blocked
 Frontend shop IDs are not trusted
 Shopify tokens are never returned
 Sensitive errors are hidden
 Input validation exists
 Database operations use proper transactions
 No secrets are committed
34. Validation Checklist

Before completing this action:

Bundle CRUD
 Create bundle works
 Read bundles works
 Read single bundle works
 Update bundle works
 Delete bundle works
Bundle Types
 Fixed Bundle supported
 Quantity Bundle supported
 Mix & Match supported
Status
 Draft supported
 Active supported
 Inactive supported
Products
 Products can be associated
 Products can be removed
 Invalid product data is rejected
Discounts
 Percentage discount supported
 Fixed amount discount supported
 Invalid discount values rejected
Publishing
 Publish validation works
 Invalid bundle cannot publish
 Valid bundle becomes active
Security
 Merchant isolation works
 Cross-shop access blocked
 Unauthorized requests rejected
Code Quality
 TypeScript passes
 Lint passes
 Tests pass
 Build passes
35. Final Verification Commands

Run only commands that exist in the project.

Possible commands:

npm run lint
npm run typecheck
npm test
npm run build

If Prisma validation/generation is part of the existing workflow, also run the appropriate Prisma commands.

Do not invent commands that are not defined by the project.

36. Completion Report

After implementation, provide a concise report containing:

Summary

Explain what was implemented.

Bundle Types

Confirm:

Fixed Bundle
Quantity Bundle
Mix & Match
API Endpoints

List all implemented bundle endpoints.

Services

List the Bundle Engine services created.

Database Changes

List any Prisma/schema changes.

If no database changes were required, explicitly state that.

Security

Explain how shop-level isolation was enforced.

Tests

Report:

Lint
TypeScript
Unit tests
Integration tests
Build
Issues

List any blockers or incomplete integrations.

Next Action

The next implementation phase is:

ACTION-006 — Storefront Widget

Do not start ACTION-006 automatically.

Wait for explicit instruction before implementing the next action.
```
