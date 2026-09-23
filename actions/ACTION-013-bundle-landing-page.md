# ACTION-013 — Bundle Landing Page

## Objective

Implement the BundleCraft Bundle Landing Page where customers can discover and purchase available bundles from the Shopify storefront.

The landing page must provide a polished, responsive, fast, and conversion-focused bundle browsing experience.

The implementation must integrate with the existing:

- Bundle Engine
- Product/Variant Sync
- Storefront Widget
- Shopify integration
- Analytics system

Do not implement unrelated features.

---

# Required Documentation To Read First

Before writing any code, Claude Code MUST read:

1. `CLAUDE.md`
2. `docs/01-PRD.md`
3. `docs/02-ARCHITECTURE.md`
4. `docs/05-SHOPIFY_INTEGRATION.md`
5. `docs/08-STOREFRONT_WIDGET.md`
6. `docs/09-BUNDLE_ENGINE.md`
7. `docs/10-MERCHANT_DASHBOARD.md`
8. `docs/11-ANALYTICS_SYSTEM.md`
9. `docs/13-SECURITY.md`
10. `docs/14-TESTING_STRATEGY.md`

Also inspect:

```text
actions/ACTION-005-bundle-engine.md
actions/ACTION-006-storefront-widget.md
actions/ACTION-008-analytics-system.md
actions/ACTION-012-product-sync.md

Read the actual existing implementation before making changes.

Do not assume previous actions were implemented exactly as planned.

Role

Act as a senior Shopify storefront engineer and conversion-focused UI developer.

Build the BundleCraft Bundle Landing Page using the existing architecture.

The result should feel like a native part of the merchant's Shopify storefront rather than an external application.

Scope

Implement the customer-facing Bundle Landing Page.

The page must support:

Bundle discovery
Bundle listing
Bundle cards
Bundle details
Bundle type indication
Discount information
Product previews
Bundle selection
Add-to-cart flow
Responsive/mobile experience
Loading states
Empty states
Error states
Analytics integration
Merchant customization support

The landing page should use active/published bundles only.

1. Landing Page Architecture

The target storefront experience from the PRD is:

/collections/bundles

The implementation must follow the existing Shopify storefront architecture.

Do not assume that a normal Next.js route can automatically become a Shopify storefront route.

Inspect the existing Theme App Extension/storefront implementation first.

Determine the correct implementation approach based on the current project architecture.

2. Inspect Existing Storefront Implementation

Before implementation inspect:

ACTION-006-storefront-widget.md

and the actual storefront code.

Identify:

Theme App Extension structure
Existing bundle widget
Storefront API utilities
Cart functionality
Bundle data retrieval
Analytics event integration
Styling system
Existing customer-facing components

Reuse existing code where appropriate.

Do not create duplicate storefront API clients or cart utilities.

3. Bundle Discovery

The landing page should retrieve published/active bundles for the current Shopify shop.

Only bundles belonging to the current merchant/store may be displayed.

Do not expose:

Draft bundles
Inactive bundles
Bundles belonging to another shop
Internal merchant-only data

The customer should see only bundles intended for storefront publication.

4. Bundle Listing

Create a responsive bundle listing interface.

Recommended conceptual structure:

Bundle Landing Page
│
├── Page Header
│
├── Bundle Grid
│   ├── Bundle Card
│   ├── Bundle Card
│   ├── Bundle Card
│   └── ...
│
└── Empty State

Do not hardcode bundle data.

Data must come from the application's actual bundle system.

5. Bundle Card

Each bundle card should provide useful customer-facing information.

Potential information:

Bundle Title
Bundle Image / Product Preview
Short Description
Bundle Type
Number of Products
Discount
Bundle Price / Savings
View Bundle

Only display information that actually exists in the current bundle model.

Do not invent product prices or discount calculations.

6. Bundle Types

The MVP supports:

Fixed Bundle
Quantity Bundle
Mix & Match

The landing page must correctly represent each bundle type.

For example:

Fixed Bundle
→ Complete predefined product set

Quantity Bundle
→ Customer selects quantity

Mix & Match
→ Customer selects products according to bundle rules

The UI must use the existing Bundle Engine logic.

Do not duplicate business rules inside the landing page.

7. Bundle Detail Experience

When a customer selects a bundle, provide a clear path to the bundle purchasing experience.

Possible flow:

Bundle Landing Page
        ↓
Select Bundle
        ↓
Bundle Detail / Selection UI
        ↓
Select Products / Variants
        ↓
Add Bundle To Cart

Reuse the existing bundle selection functionality from the Storefront Widget where possible.

Do not create two different implementations of bundle selection logic.

8. Product Preview

Bundle cards should provide visual product context where product information is available.

For example:

Product 1
Product 2
Product 3
+ More

Use synchronized product/variant information created by:

ACTION-012-product-sync.md

Do not make unnecessary Admin API requests from the browser.

Use the appropriate storefront-accessible data source.

9. Product Images

Product images must:

Preserve aspect ratio
Be responsive
Avoid layout shifts
Use appropriate image sizing
Provide useful alt text
Avoid loading unnecessary high-resolution images

Do not load every product image at maximum resolution.

10. Bundle Pricing

Display pricing based on the actual bundle configuration.

The page may display:

Original Value
Bundle Price
Savings
Discount

Only calculate/display values supported by the existing bundle and discount architecture.

Do not implement a second pricing engine.

The source of truth remains the Bundle Engine and Shopify pricing/discount system.

11. Bundle Discount Messaging

If a bundle has a discount configured, display customer-friendly messaging.

Examples:

Save 10%
Save $20
Bundle & Save

Do not display misleading savings.

If no discount exists, do not invent a discount message.

12. Bundle CTA

Each bundle should have a clear CTA.

Examples:

View Bundle
Build Your Bundle
Shop Bundle
Add Bundle

Use the appropriate CTA according to the bundle type and current storefront flow.

The CTA must lead into the existing bundle purchasing flow.

13. Add To Cart

The landing page must ultimately support the existing bundle cart flow.

Expected architecture:

Customer
 ↓
Select Bundle
 ↓
Select Products / Variants
 ↓
Validate Bundle
 ↓
Add Products To Shopify Cart
 ↓
Attach Bundle Metadata
 ↓
Analytics Event

Do not bypass bundle validation.

Do not directly trust customer-submitted bundle selections.

14. Bundle Metadata

When a bundle is added to cart, use the existing bundle metadata strategy from:

docs/08-STOREFRONT_WIDGET.md

The implementation should allow the system to identify:

Bundle ID
Bundle reference
Selected products/variants

where supported by the existing architecture.

Do not expose internal database secrets or merchant credentials.

15. Analytics Integration

Integrate the landing page with the existing analytics system.

At minimum support:

bundle_view
bundle_add

The event flow should remain consistent with:

docs/11-ANALYTICS_SYSTEM.md

A bundle view should be recorded when appropriate.

A bundle add should be recorded only after the bundle add action is successfully initiated according to the existing analytics architecture.

Do not block the customer experience if analytics collection fails.

16. Analytics Failure Handling

Analytics must never prevent a customer from purchasing a bundle.

For example:

Cart Add
  ↓
Success
  ↓
Analytics
  ↓
Analytics Failure
  ↓
Customer purchase remains successful

Analytics failures should be logged appropriately.

Do not show unnecessary technical errors to customers.

17. Merchant Customization

The landing page must respect the merchant's bundle customization settings.

Potential settings include:

Primary Color
Button Color
Background Color
Typography
Font Size
Layout

The implementation must use the actual customization model created in the existing project.

Do not hardcode a single visual theme.

18. Layout Options

The PRD supports:

Card Layout
Horizontal Layout
Vertical Layout

If these options are implemented in the current customization architecture, the landing page must render the selected layout.

Do not duplicate customization logic.

Create reusable presentation components where appropriate.

19. Responsive Design

The landing page must work across:

Mobile
Tablet
Desktop

Prioritize mobile usability.

Ensure:

Touch-friendly buttons
Readable typography
Proper spacing
Responsive product cards
No horizontal overflow
Proper image sizing

Test common viewport sizes.

20. Loading State

Create a customer-friendly loading state.

Examples:

Skeleton cards
Loading indicator

Avoid blank screens while bundles are loading.

Do not expose internal implementation details.

21. Empty State

If the merchant has no published bundles:

Display a customer-friendly empty state.

Do not expose:

Database IDs
API errors
Internal configuration
Merchant dashboard information

The empty state should not look like an application error.

22. Error State

If bundle retrieval fails:

Display a friendly error message.
Provide a retry option where appropriate.
Log the technical error.
Do not expose secrets or stack traces.

Example customer-facing message:

Something went wrong while loading bundles.
Please try again.

Do not expose raw API responses.

23. Accessibility

Implement accessible storefront UI.

Requirements include:

Semantic HTML
Accessible buttons
Keyboard navigation
Focus states
Image alt text
Sufficient text/background contrast
Proper heading hierarchy
Accessible loading/error states

Do not rely exclusively on color to communicate state.

24. Performance

The landing page should be lightweight.

Avoid:

Large unnecessary JavaScript bundles
Unnecessary API requests
Repeated product requests
Blocking analytics requests
Loading all bundle details before displaying the listing

Use:

Lazy loading where appropriate
Responsive images
Efficient API requests
Caching where compatible with the architecture

Do not introduce a complex caching infrastructure unless required.

25. SEO

The landing page should support basic storefront SEO.

Where the architecture allows, provide:

Meaningful page title
Useful heading structure
Descriptive bundle content
Crawlable bundle content
Proper image alt text

Do not implement a complete SEO system in this action.

26. Security

Customer-facing code must never expose:

Shopify Admin API access tokens
Shopify app secrets
Database credentials
Private merchant data

Only expose the minimum bundle/product data required by the storefront.

All bundle operations must validate the merchant/shop context server-side.

27. API/Data Layer

If a dedicated endpoint is required for the landing page, follow the existing API conventions.

Potential endpoint:

GET /api/storefront/bundles

The exact endpoint should follow the current architecture.

Do not create an endpoint if the existing storefront data layer already provides an appropriate solution.

28. Testing

Create tests for:

Bundle Listing
Published bundles displayed
Draft bundles hidden
Inactive bundles hidden
Bundle Types
Fixed Bundle
Quantity Bundle
Mix & Match
Product Preview
Products display correctly
Missing image handled safely
Missing product data handled safely
Pricing
Correct configured discount displayed
No discount displayed when none exists
Cart
Correct bundle flow
Variant selection
Validation before cart add
Analytics
bundle_view
bundle_add
Analytics failure does not block cart
Customization
Colors
Typography
Layout
Responsive UI
Mobile
Tablet
Desktop
Security
Cross-shop bundle access blocked
Internal data not exposed
29. Type Safety

Use TypeScript.

Avoid unnecessary:

any

Use typed interfaces for:

Bundle
BundleProduct
Product
ProductVariant
Customization
StorefrontBundle

Validate external data before rendering.

30. Documentation Updates

After implementation update relevant documentation if necessary.

Potential files:

docs/08-STOREFRONT_WIDGET.md
docs/09-BUNDLE_ENGINE.md
docs/11-ANALYTICS_SYSTEM.md
docs/13-SECURITY.md
docs/14-TESTING_STRATEGY.md

Document actual implementation details only.

Do not rewrite unrelated documentation.

31. Validation Commands

Run the actual project validation commands.

Attempt:

npm run lint
npm run typecheck
npm test
npm run build

If any command does not exist:

Do not invent it.
Use the project's actual equivalent if available.
Report the result honestly.
32. Final Verification Checklist

Before marking this action complete:

 Bundle landing page implemented
 Published bundles displayed
 Draft bundles hidden
 Inactive bundles hidden
 Fixed Bundle supported
 Quantity Bundle supported
 Mix & Match supported
 Product previews implemented
 Bundle pricing handled
 Discount messaging handled
 Bundle CTA implemented
 Existing cart flow reused
 Bundle metadata preserved
 bundle_view integrated
 bundle_add integrated
 Analytics failure does not block purchase
 Merchant customization supported
 Responsive design implemented
 Loading state implemented
 Empty state implemented
 Error state implemented
 Accessibility checked
 Performance reviewed
 Basic SEO handled
 Security reviewed
 Tests created
 Lint checked
 Typecheck checked
 Tests checked
 Build checked
 Documentation updated where necessary
Important Restrictions

DO NOT implement:

New bundle types
Subscription bundles
Gift bundles
BOGO
Volume bundles
Multi-currency
Multilingual support
B2B functionality
Wholesale functionality
AI recommendations
Advanced SEO system
Advanced personalization
New billing features
Unrelated dashboard features

Keep this action focused on:

Bundle Landing Page for the Shopify Storefront.

Completion Report

When finished, provide:

1. Implementation Summary

Explain what was implemented.

2. Files Created

List every new file.

3. Files Modified

List every modified file.

4. Storefront Architecture

Explain how the landing page is connected to the Shopify storefront.

5. Bundle Integration

Explain how bundles are retrieved and displayed.

6. Cart Integration

Explain how the existing bundle cart flow is reused.

7. Analytics

Explain:

bundle_view
bundle_add

integration.

8. Customization

Explain how merchant customization settings are applied.

9. Testing

List tests created and actual results.

10. Validation

Report actual results:

Lint:
Typecheck:
Tests:
Build:
11. Issues

List unresolved issues honestly.

Do not claim Shopify production verification unless it was actually performed.

12. Next Action

After completing this action, the next planned action is:

ACTION-014-template-system.md

Do not execute the next action automatically.
```
