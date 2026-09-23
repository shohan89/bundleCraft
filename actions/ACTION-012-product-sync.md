# ACTION-012 — Product & Variant Sync

## Objective

Implement the Shopify product and variant synchronization system for BundleCraft.

The goal is to keep the product/variant information required by BundleCraft synchronized with the merchant's Shopify store while maintaining strict multi-tenant isolation and reliable webhook-driven updates.

This action builds on:

- Shopify authentication
- Shopify webhooks
- Bundle Engine
- Database architecture

Do not implement unrelated features.

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
8. `docs/09-BUNDLE_ENGINE.md`
9. `docs/13-SECURITY.md`
10. `docs/14-TESTING_STRATEGY.md`

Also inspect:

```text
actions/ACTION-002-database-setup.md
actions/ACTION-003-shopify-authentication.md
actions/ACTION-005-bundle-engine.md
actions/ACTION-011-shopify-webhooks.md

Read the actual existing implementation before making changes.

Do not assume previous actions were implemented exactly as planned.

Role

Act as a senior Shopify SaaS engineer responsible for implementing a production-ready product and variant synchronization system.

The implementation must:

Follow the existing BundleCraft architecture.
Reuse existing Shopify API utilities.
Reuse existing authentication.
Reuse the webhook infrastructure.
Maintain tenant isolation.
Avoid unnecessary duplication.
Be type-safe.
Be testable.
Be scalable for future bundle functionality.
Scope

Implement:

Product synchronization
Variant synchronization
Initial product import
Product update synchronization
Product creation synchronization
Product deletion synchronization
Variant data handling
Product/variant API access
Bundle product selection integration
Sync status handling
Error handling
Retry-safe synchronization
Tests

The system should provide a clean product catalog layer for the BundleCraft bundle engine.

1. Inspect Existing Database

First inspect the existing Prisma schema.

Determine whether the current database already contains:

Product
ProductVariant

or equivalent models.

Do not automatically create duplicate models.

If product/variant models are missing, extend the schema according to the existing architecture.

The database design must support:

Shop
  ↓
Products
  ↓
Variants

Every product must belong to exactly one Shopify shop.

2. Product Data Model

If required, implement a product model containing the information BundleCraft actually needs.

Potential fields include:

id
shopId
shopifyProductId
title
handle
description
vendor
productType
status
featuredImage
createdAt
updatedAt
syncedAt

Only implement fields that are justified by the current application requirements.

Do not create unnecessary product metadata.

3. Variant Data Model

If required, implement a product variant model.

Potential fields:

id
productId
shopifyVariantId
title
sku
price
compareAtPrice
availableForSale
inventoryQuantity
image
createdAt
updatedAt
syncedAt

The exact fields must match the existing architecture and Shopify data actually required by BundleCraft.

Do not store unnecessary sensitive information.

4. Database Relationships

Ensure the relationship follows:

Shop
  │
  └── Product
        │
        └── ProductVariant

A product must never be accessible across shops.

Example:

Shop A
 ├── Product A1
 └── Product A2

Shop B
 ├── Product B1
 └── Product B2

Shop A must never be able to query Product B1 or Product B2.

5. Database Indexes

Add appropriate indexes for frequently queried fields.

At minimum consider:

shopId
shopifyProductId
productId
shopifyVariantId

Composite uniqueness should be considered for Shopify identifiers.

For example:

(shopId, shopifyProductId)
(shopId, shopifyVariantId)

The exact implementation must follow the existing Prisma/database architecture.

6. Initial Product Synchronization

Implement an initial synchronization process for a newly installed Shopify store.

The process should:

Shopify Store
     ↓
Fetch Products
     ↓
Validate Data
     ↓
Create/Update Local Products
     ↓
Create/Update Variants
     ↓
Mark Sync Complete

Use the existing Shopify Admin API integration.

Do not create a new authentication mechanism.

7. Pagination

Shopify product catalogs can contain many products.

The synchronization process must support pagination.

Do not assume:

one API request = all products

Implement the synchronization using the project's supported Shopify pagination approach.

The system must be capable of handling larger catalogs without silently missing products.

8. Product Create Webhook

Integrate with the webhook infrastructure created in:

ACTION-011-shopify-webhooks.md

When a product is created in Shopify:

Shopify
   ↓
PRODUCTS_CREATE
   ↓
Webhook Handler
   ↓
Product Sync Service
   ↓
Database

The handler should create the local product and its variants.

9. Product Update Webhook

When a Shopify product is updated:

PRODUCTS_UPDATE

the system should:

Identify the shop.
Identify the Shopify product.
Find the local product.
Update product information.
Synchronize variants.
Update synchronization timestamps.
Handle removed variants where applicable.

The operation must be idempotent.

10. Product Delete Webhook

When Shopify sends:

PRODUCTS_DELETE

the system should safely process the deletion.

Before deleting local data, inspect whether the product is currently referenced by:

Bundle
BundleProduct
Analytics
Other application records

Do not cause database integrity problems.

The implementation should follow the existing database relationship strategy.

Possible approaches include:

Hard delete

or:

Soft delete / inactive status

Choose based on the existing architecture and document the decision.

11. Variant Synchronization

Product variants are critical to BundleCraft because customers may need to select specific variants before adding a bundle to cart.

Synchronization must handle:

Variant creation
Variant updates
Variant removal
Price changes
Availability changes
SKU changes
Variant title changes
Variant image changes where supported
Inventory-related information where required

Do not store more inventory information than the application requires.

12. Product Service Layer

Create a reusable service layer.

Example:

ProductService

Possible methods:

syncProduct()
syncProducts()
syncProductVariants()
getProducts()
getProduct()
deleteProduct()

Adapt naming to the existing codebase.

Do not put Shopify API calls directly inside dashboard components.

13. Shopify API Layer

Reuse the existing Shopify API client.

The architecture should remain:

UI
 ↓
API Route
 ↓
Product Service
 ↓
Shopify API / Database

Do not create duplicate Shopify clients.

Do not expose Shopify access tokens to the browser.

14. Product API

Implement product API endpoints needed by the merchant dashboard and bundle builder.

Potential endpoints:

GET /api/products
GET /api/products/:id

If required:

POST /api/products/sync

The endpoint design must follow:

docs/06-API_SPECIFICATION.md

and the existing API conventions.

15. Product Filtering

The product API should support basic merchant-friendly filtering where useful.

Potential filters:

search
status
productType
vendor

Do not over-engineer filtering in this action.

The primary purpose is reliable product retrieval for bundle creation.

16. Bundle Engine Integration

Update the Bundle Engine so merchants can select synchronized Shopify products and variants.

The flow should become:

Merchant
   ↓
Create Bundle
   ↓
Search Products
   ↓
Select Product
   ↓
Select Variant
   ↓
Configure Bundle

The bundle should reference stable internal product/variant records.

Do not duplicate complete product information inside every bundle record unless the existing architecture explicitly requires snapshots.

17. Product Availability

When products or variants are no longer available, the Bundle Engine must be able to identify that state.

For example:

Active Product
Inactive Product
Deleted Product
Unavailable Variant

Do not automatically delete active bundles simply because a product changes.

Instead, expose the state so the merchant can resolve the issue.

18. Sync Status

Provide a way to determine synchronization status.

Possible states:

PENDING
SYNCING
SYNCED
FAILED

If the existing database architecture does not require persistent sync states, use the simplest reliable implementation.

At minimum, maintain useful timestamps such as:

syncedAt
updatedAt
19. Sync Error Handling

Handle:

Shopify API failure
Invalid product payload
Invalid variant payload
Missing shop
Missing product
Database failure
Duplicate product
Duplicate variant
Partial synchronization failure

Errors should be logged without exposing:

Access tokens
App secrets
Database credentials
20. Idempotency

Product synchronization must be idempotent.

Repeated synchronization of the same Shopify product should not create duplicates.

Use:

shopId + shopifyProductId

as the tenant-aware product identity.

For variants use:

shopId + shopifyVariantId

Do not identify products using title or handle alone.

21. Race Conditions

Consider situations such as:

Initial Sync
     +
Product Update Webhook

arriving at approximately the same time.

The implementation should avoid duplicate records and inconsistent state.

Use:

Database uniqueness
Upsert operations where appropriate
Transactional operations where appropriate

Do not add unnecessary locking unless required.

22. Performance

Product synchronization should be designed for large stores.

Avoid:

N+1 database queries

where practical.

Use appropriate:

Batch operations
Transactions
Pagination
Upserts
Database indexes

Do not sacrifice correctness for premature optimization.

23. Security

The implementation MUST maintain:

Shopify authentication
Shop-level isolation
Server-side access tokens
API authorization
Input validation
Safe error handling

A merchant must only see products belonging to their own Shopify store.

24. Testing

Create tests for:

Product creation
New product sync
Product with multiple variants
Product update
Product title update
Price update
Variant update
Product deletion
Deleted product
Product referenced by bundle
Multi-tenant isolation
Shop A cannot access Shop B products
Idempotency
Same product synchronized twice
Same webhook processed twice
Pagination
Multiple product pages
API
Product listing
Product search
Unauthorized request
Invalid shop context
Failure cases
Shopify API failure
Database failure
Invalid payload
25. Type Safety

Use TypeScript throughout.

Avoid unnecessary:

any

Validate external Shopify data before passing it into internal services.

Use clear interfaces/types for:

ShopifyProduct
ShopifyVariant
Product
ProductVariant

where appropriate.

26. Documentation Updates

After implementation update documentation where necessary.

Potential files:

docs/04-DATABASE_DESIGN.md
docs/05-SHOPIFY_INTEGRATION.md
docs/06-API_SPECIFICATION.md
docs/09-BUNDLE_ENGINE.md
docs/14-TESTING_STRATEGY.md

Document only actual implementation changes.

Do not rewrite unrelated documentation.

27. Validation Commands

Run the project's actual validation commands.

At minimum attempt:

npm run lint
npm run typecheck
npm test
npm run build

If any command does not exist:

Do not invent a replacement.
Use the actual project command if one exists.
Report unavailable commands honestly.
28. Final Verification Checklist

Before marking this action complete:

 Product model verified/implemented
 Variant model verified/implemented
 Product/variant relationships implemented
 Tenant-aware unique constraints implemented
 Product indexes implemented
 Initial product sync implemented
 Pagination implemented
 Product create webhook integrated
 Product update webhook integrated
 Product delete webhook integrated
 Variant synchronization implemented
 Product service layer implemented
 Product API implemented
 Bundle Engine integration completed
 Product availability handled
 Sync timestamps/status handled
 Idempotency implemented
 Race-condition risks addressed
 Security verified
 Tests created
 Lint checked
 Typecheck checked
 Tests checked
 Build checked
 Documentation updated where necessary
Important Restrictions

DO NOT implement:

Advanced inventory management
Multi-location inventory architecture
Shopify Markets
Multi-currency
B2B catalog management
Wholesale features
AI product recommendations
Advanced search engine
Advanced product analytics
New billing functionality
New bundle types
Future roadmap features

Keep this action focused on:

Shopify Product & Variant Synchronization.

Completion Report

When finished, provide:

1. Implementation Summary

What was implemented.

2. Files Created

List all new files.

3. Files Modified

List all modified files.

4. Database Changes

List Prisma/schema/migration changes.

5. Shopify Integration

Explain:

Initial sync
Product webhooks
Variant synchronization
Pagination
6. Bundle Integration

Explain how synchronized products and variants are used by the Bundle Engine.

7. Security

Explain tenant isolation and token handling.

8. Tests

List tests created and actual results.

9. Validation

Report actual results:

Lint:
Typecheck:
Tests:
Build:
10. Issues

List unresolved issues honestly.

Do not claim Shopify production verification unless it was actually performed.

11. Next Action

After completing this action, the next planned action is:

ACTION-013-bundle-landing-page.md

Do not execute the next action automatically.
```
