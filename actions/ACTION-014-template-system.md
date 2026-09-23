# ACTION-014 — Bundle Template System

## Objective

Implement the BundleCraft template system for creating bundles from predefined, industry-specific templates.

The template system should make bundle creation faster for merchants while keeping the bundle engine flexible and reusable.

The MVP templates defined in the PRD are:

### Fashion

- Complete Look
- Weekend Outfit
- Seasonal Collection

### Beauty

- Skincare Routine
- Hair Care Kit

The implementation must integrate with the existing:

- Bundle Engine
- Merchant Dashboard
- Product/Variant System
- Database
- Storefront
- Customization system

Do not implement unrelated features.

---

# Required Documentation To Read First

Before writing any code, Claude Code MUST read:

1. `CLAUDE.md`
2. `docs/01-PRD.md`
3. `docs/02-ARCHITECTURE.md`
4. `docs/04-DATABASE_DESIGN.md`
5. `docs/09-BUNDLE_ENGINE.md`
6. `docs/10-MERCHANT_DASHBOARD.md`
7. `docs/08-STOREFRONT_WIDGET.md`
8. `docs/14-TESTING_STRATEGY.md`

Also inspect:

```text
actions/ACTION-004-merchant-dashboard.md
actions/ACTION-005-bundle-engine.md
actions/ACTION-012-product-sync.md
actions/ACTION-013-bundle-landing-page.md

Read the actual existing implementation before making changes.

Do not assume previous actions were implemented exactly as planned.

Role

Act as a senior SaaS product engineer responsible for implementing a reusable template system for BundleCraft.

The system should allow merchants to start bundle creation from a template instead of configuring every field manually.

Templates are starting configurations.

They must NOT become hardcoded bundle types.

Scope

Implement:

Template model/structure
Template categories
Template definitions
Template selection
Template preview
Template-to-bundle initialization
Template-specific defaults
Merchant dashboard integration
Template validation
API/service layer where required
Tests
1. Template Architecture

The template system should follow:

Template
   ↓
Merchant selects template
   ↓
Template configuration loaded
   ↓
Create Bundle Wizard
   ↓
Merchant selects products
   ↓
Merchant configures discount
   ↓
Merchant customizes design
   ↓
Bundle created

A template should provide a starting point.

It should not prevent merchants from modifying the resulting bundle.

2. Template Categories

Implement the MVP categories:

Fashion
Beauty

Use a scalable structure so future categories can be added without rewriting the template engine.

Possible structure:

Template Category
   ↓
Templates
   ↓
Template Configuration
3. Fashion Templates

Implement:

Complete Look

Purpose:

Allow a merchant to create a bundle representing a complete outfit/look.

Possible starting structure:

Top
Bottom
Shoes
Accessory

Do not force these product categories if the merchant's catalog does not support them.

The template should provide configuration guidance/defaults rather than hard restrictions.

Weekend Outfit

Purpose:

Create a curated outfit suitable for a weekend.

Possible product grouping:

Main Clothing
Secondary Clothing
Footwear
Accessory

Again, these should be starting suggestions, not mandatory product classifications unless supported by the existing bundle engine.

Seasonal Collection

Purpose:

Create a bundle around a seasonal product collection.

Possible examples:

Seasonal Product 1
Seasonal Product 2
Seasonal Product 3
Seasonal Product 4

The merchant must be able to change the selected products.

4. Beauty Templates

Implement:

Skincare Routine

Purpose:

Create a skincare routine bundle.

Possible starting structure:

Cleanser
Treatment
Moisturizer
SPF

These are template suggestions.

Do not require merchants to classify products into these categories unless such functionality already exists.

Hair Care Kit

Purpose:

Create a hair-care bundle.

Possible starting structure:

Shampoo
Conditioner
Treatment
Styling Product

These should be editable merchant-facing suggestions.

5. Template Data Structure

Inspect the existing Template model from:

docs/04-DATABASE_DESIGN.md

Reuse the existing model if already implemented.

If additional fields are required, extend it carefully.

A template may contain information such as:

id
name
slug
category
description
bundleType
defaultDiscountType
defaultDiscountValue
defaultLayout
defaultCustomization
configuration
isActive
createdAt
updatedAt

Do not add fields that are not required by the current implementation.

6. Template Configuration

Template configuration should be flexible.

A configuration object may define:

Suggested product count
Product role suggestions
Default bundle type
Default discount configuration
Default layout
Default customer-facing copy

Keep template-specific configuration separate from merchant-specific bundle data.

7. Template vs Bundle

A critical rule:

Template ≠ Bundle

The template is the starting blueprint.

The bundle is the merchant's actual configuration.

For example:

Complete Look Template
        ↓
Merchant selects:
Nike Shirt
Nike Pants
Nike Shoes
        ↓
Actual Bundle

After bundle creation, changes to the template must not unexpectedly modify existing bundles.

8. Template Seeding

Seed the MVP templates into the database if the architecture uses database-backed templates.

Required templates:

Fashion
├── Complete Look
├── Weekend Outfit
└── Seasonal Collection

Beauty
├── Skincare Routine
└── Hair Care Kit

Use stable slugs.

Example:

complete-look
weekend-outfit
seasonal-collection
skincare-routine
hair-care-kit

Do not create duplicate templates when the seed process runs multiple times.

Use idempotent seeding.

9. Template Service

Create a reusable service layer.

Possible structure:

TemplateService

Potential methods:

getTemplates()
getTemplateById()
getTemplateBySlug()
getTemplatesByCategory()
createBundleFromTemplate()

Adapt naming to the existing codebase.

Do not put template business logic directly inside React components.

10. Template API

Implement APIs only where required by the existing dashboard architecture.

Potential endpoints:

GET /api/templates
GET /api/templates/:id

If template-to-bundle creation requires a dedicated endpoint, use an appropriate endpoint following the existing API conventions.

Do not create unnecessary APIs.

11. Template Selection UI

Integrate template selection into the existing Create Bundle wizard.

The flow should be:

Create Bundle
      ↓
Choose Template
      ↓
Choose Products
      ↓
Configure Bundle
      ↓
Configure Discount
      ↓
Customize Design
      ↓
Review
      ↓
Publish

Use the existing dashboard components and design system.

Do not create a second dashboard layout.

12. Template Cards

Each template should have a clear card.

Possible information:

Template Name
Category
Description
Bundle Type
Recommended Product Count
Use Template

Do not display internal database information.

13. Template Preview

Provide a useful preview before the merchant selects a template.

The preview can show:

Template name
Description
Suggested product structure
Default bundle type
Default discount
Suggested storefront layout

Do not require actual Shopify products for the template preview.

14. Template Defaults

When a merchant selects a template, populate the bundle wizard with the template defaults.

For example:

Template
   ↓
Default Bundle Type
   ↓
Default Discount
   ↓
Default Layout
   ↓
Default Copy

The merchant must be able to modify these values.

Do not lock the merchant to template defaults.

15. Product Selection

Templates may provide product role suggestions.

However, the merchant must select actual products from their synchronized Shopify catalog.

Use the product system implemented in:

ACTION-012-product-sync.md

Do not manually enter product IDs into templates.

16. Bundle Type Compatibility

Templates must work with the existing MVP bundle types:

Fixed Bundle
Quantity Bundle
Mix & Match

The template may provide a recommended default.

The final bundle type must remain controlled by the Bundle Engine.

Do not duplicate bundle validation logic inside the template system.

17. Discount Defaults

Templates may define a default discount.

For example:

Percentage
Fixed Amount

However:

The merchant can change it.
The merchant can remove it.
The Bundle Engine remains the source of truth.
The Discount Function remains responsible for actual Shopify discount execution.

Do not implement discount execution in this action.

18. Design Defaults

Templates may define starting visual settings.

Potential settings:

Primary Color
Button Color
Background
Typography
Layout

These should initialize the bundle customization settings.

The merchant must be able to modify them later.

19. Merchant Isolation

Templates are generally reusable application-level configurations.

Merchant-specific bundle data must remain isolated.

For example:

Template
     ↓
Shop A → Bundle A1
Shop B → Bundle B1

Shop A must never see Shop B's bundle data.

If merchants can create custom templates in a future feature, that must be treated separately.

Do not implement custom merchant-created templates in this action.

20. Template Activation

Support an active/inactive state for templates if the database architecture includes it.

Only active templates should be displayed to merchants.

Inactive templates should remain stored but not selectable.

Do not delete templates simply to hide them.

21. Error Handling

Handle:

Template not found
Template inactive
Invalid template configuration
Template creation failure
Database failure
Invalid bundle configuration

Do not expose raw database errors to merchants.

Use the project's existing error-handling system.

22. Validation

Before creating a bundle from a template, validate:

Template exists
Template is active
Template configuration is valid
Default bundle type is supported
Default discount configuration is valid
Default customization is valid

Then pass the resulting configuration into the existing Bundle Engine.

Do not duplicate the Bundle Engine's complete validation system.

23. Testing

Create tests for:

Template Retrieval
List templates
Filter by category
Retrieve by ID
Retrieve by slug
Inactive template handling
Template Seeding
All five templates exist
Re-running seed does not duplicate templates
Template Selection
Fashion template selection
Beauty template selection
Bundle Creation
Create bundle from template
Defaults correctly applied
Merchant can modify defaults
Security
Merchant bundle data remains isolated
Internal template configuration is not unnecessarily exposed
Validation
Invalid template rejected
Inactive template rejected
Unsupported bundle type rejected
24. Type Safety

Use TypeScript.

Avoid unnecessary:

any

Create appropriate types for:

BundleTemplate
TemplateCategory
TemplateConfiguration
TemplateDefaults

Validate dynamic configuration before use.

25. UI/UX Requirements

The template system should be:

Simple
Fast
Clear
Responsive
Beginner-friendly

A merchant with no technical knowledge should understand:

What is this template?
↓
What type of bundle does it create?
↓
What products should I select?
↓
What happens after I choose it?

Avoid technical terminology in merchant-facing UI.

26. Accessibility

Template selection UI must support:

Keyboard navigation
Visible focus states
Semantic buttons
Accessible labels
Proper heading hierarchy
Screen-reader-friendly template descriptions

Do not make the entire interaction dependent on hover.

27. Performance

Template loading should be lightweight.

Avoid:

Unnecessary API requests
Loading Shopify product data before a template is selected
Large template assets
Duplicate database queries

Templates should load quickly in the Create Bundle wizard.

28. Documentation Updates

After implementation update relevant documentation where necessary.

Potential files:

docs/04-DATABASE_DESIGN.md
docs/09-BUNDLE_ENGINE.md
docs/10-MERCHANT_DASHBOARD.md
docs/14-TESTING_STRATEGY.md

Document actual implementation details only.

29. Validation Commands

Run the project's actual validation commands.

Attempt:

npm run lint
npm run typecheck
npm test
npm run build

If a command does not exist:

Do not invent it.
Use the actual project equivalent if available.
Report it honestly.
30. Final Verification Checklist

Before marking this action complete:

 Template architecture implemented
 Template categories implemented
 Complete Look template implemented
 Weekend Outfit template implemented
 Seasonal Collection template implemented
 Skincare Routine template implemented
 Hair Care Kit template implemented
 Template seed data implemented
 Seed is idempotent
 Template service implemented
 Template API implemented where required
 Template selection integrated into Create Bundle wizard
 Template preview implemented
 Template defaults implemented
 Product selection integrated
 Bundle Engine remains source of truth
 Discount defaults integrated
 Design defaults integrated
 Merchant isolation verified
 Active/inactive template handling implemented
 Validation implemented
 Error handling implemented
 Tests created
 Accessibility checked
 Performance reviewed
 Lint checked
 Typecheck checked
 Tests checked
 Build checked
 Documentation updated where necessary
Important Restrictions

DO NOT implement:

Custom merchant-created templates
Template marketplace
AI-generated templates
Subscription bundles
Gift bundles
BOGO
Volume bundles
Multi-currency
Multilingual templates
B2B templates
Wholesale templates
Advanced recommendation engine
New billing features
New analytics features

Keep this action focused on:

MVP Bundle Template System.

Completion Report

When finished, provide:

1. Implementation Summary

Explain what was implemented.

2. Templates

List the five implemented MVP templates.

3. Files Created

List every new file.

4. Files Modified

List every modified file.

5. Database Changes

List Prisma/schema/migration/seed changes.

6. Dashboard Integration

Explain how template selection integrates with the Create Bundle wizard.

7. Bundle Engine Integration

Explain how template defaults are passed to the Bundle Engine.

8. Testing

List tests created and actual results.

9. Validation

Report actual results:

Lint:
Typecheck:
Tests:
Build:
10. Issues

List unresolved issues honestly.

Do not claim successful Shopify production verification unless it was actually performed.

11. Next Action

After completing this action, the next planned action is:

ACTION-015-theme-customization.md

Do not execute the next action automatically.
```
