# ACTION-006 — Storefront Widget Implementation

## Objective

Implement the BundleCraft customer-facing storefront experience.

The Storefront Widget allows Shopify customers to discover and interact with bundles directly from the merchant's storefront.

The MVP storefront experience should support:

- Product Page Bundle Widget
- Bundle Landing Page
- Bundle product selection
- Bundle customization display
- Add bundle products to cart
- Mobile-friendly UI
- Bundle analytics event integration points

The implementation must follow:

- `docs/08-STOREFRONT_WIDGET.md`
- `docs/09-BUNDLE_ENGINE.md`
- Existing Shopify integration architecture
- Existing Bundle Engine APIs

Do not implement Shopify discount execution in this action.

Discount execution will be implemented separately through Shopify Functions.

---

# Required Documentation To Read First

Before implementation, read:

1. `CLAUDE.md`
2. `docs/01-PRD.md`
3. `docs/02-ARCHITECTURE.md`
4. `docs/03-TECH_STACK.md`
5. `docs/05-SHOPIFY_INTEGRATION.md`
6. `docs/06-API_SPECIFICATION.md`
7. `docs/08-STOREFRONT_WIDGET.md`
8. `docs/09-BUNDLE_ENGINE.md`
9. `tasks/phase-06-widget/storefront-widget.md`

Also inspect:

```text
ACTION-001
ACTION-002
ACTION-003
ACTION-004
ACTION-005

Do not duplicate existing functionality.

Role

Act as a senior Shopify storefront engineer specializing in:

Shopify Theme App Extensions
Storefront API
Shopify cart functionality
React
TypeScript
Customer-facing ecommerce UI
Mobile-first storefront experiences
Performance optimization

Build the storefront experience as a production-quality Shopify app feature.

1. Storefront Architecture

The storefront architecture should follow:

Shopify Storefront
        ↓
Theme App Extension
        ↓
Bundle Widget
        ↓
Bundle Data
        ↓
BundleCraft Backend/API
        ↓
Shop + Bundle

The customer-facing widget must not expose merchant secrets.

Never expose:

Shopify Admin API access tokens
Database credentials
Supabase credentials
Private environment variables
Internal authentication secrets
2. Product Page Widget

Implement the BundleCraft widget that can appear on a Shopify product page.

The widget should allow customers to discover relevant bundles associated with the product.

Example conceptual UI:

Complete the Look

[ Product Image ]
T-Shirt

+

[ Product Image ]
Jeans

+

[ Product Image ]
Shoes

Bundle Price: $120
Save 10%

[ Add Bundle to Cart ]

The exact visual implementation should follow the project's existing design system.

3. Theme App Extension

Implement the storefront widget using the Theme App Extension architecture defined in:

docs/05-SHOPIFY_INTEGRATION.md
docs/08-STOREFRONT_WIDGET.md

The extension should be structured so merchants can add the BundleCraft widget to supported storefront locations.

Do not modify the merchant's theme files directly.

Prefer Shopify's app extension mechanism.

4. Widget Configuration

The widget should support the bundle customization values stored by the Bundle Engine.

Support:

Primary Color
Button Color
Background
Typography
Font Size
Layout

Supported layouts:

Card
Horizontal
Vertical

The widget should render according to the bundle's saved customization configuration.

If customization data is missing, use safe default values.

Do not hardcode merchant-specific branding.

5. Bundle Types

The storefront widget must understand the three MVP bundle types.

Fixed Bundle

Display all products included in the bundle.

The customer should be able to review the included products and add the bundle to cart.

Quantity Bundle

Display the products available for the quantity bundle.

Allow the customer to select the required quantity according to the bundle configuration.

Example:

Choose 3 products

[ Product A ]
[ Product B ]
[ Product C ]
[ Product D ]

Selected: 2 / 3

The customer should not be allowed to proceed until the bundle's required selection rules are satisfied.

Mix & Match

Allow customers to select products from the bundle's available products.

Example:

Build Your Bundle

Choose any 3

[ Product A ] [ Product B ]
[ Product C ] [ Product D ]
[ Product E ] [ Product F ]

Selected: 2 / 3

[ Add Bundle ]

Prevent invalid selections.

6. Bundle Data Retrieval

The storefront should retrieve only the data required to render the bundle.

Do not expose internal merchant data.

The response should contain information such as:

Bundle ID
Bundle Name
Bundle Type
Products
Variants
Required Quantity
Discount Configuration
Customization
Status

Only active/published bundles should be rendered to customers.

Draft and inactive bundles must not appear on the storefront.

7. Storefront API Usage

Follow the Shopify integration architecture in:

docs/05-SHOPIFY_INTEGRATION.md

Use the appropriate Shopify storefront-facing APIs for customer-facing product/cart operations.

Do not use Shopify Admin API credentials in browser-side storefront code.

The storefront implementation must keep private credentials on the server.

8. Product Information

Display appropriate Shopify product information.

Where available, display:

Product title
Product image
Variant
Price
Selected state
Quantity/selection state

Do not rely on stale product data if the architecture provides a way to retrieve current storefront information.

Do not create a second product catalog.

Shopify remains the source of truth for merchant products.

9. Variant Selection

Where a product has multiple variants, the widget should support appropriate variant selection.

Example:

T-Shirt

Size:
[ S ] [ M ] [ L ] [ XL ]

Color:
[ Black ] [ White ]

Only valid variants should be selectable.

The selected variant must be used when adding products to the cart.

10. Add Bundle To Cart

Implement the customer-facing Add Bundle flow.

The basic flow:

Customer selects products
        ↓
Validate selection
        ↓
Validate bundle
        ↓
Build cart items
        ↓
Add selected products to Shopify cart
        ↓
Attach bundle metadata where supported
        ↓
Show success state

The cart operation must use the storefront-compatible Shopify cart mechanism.

Do not expose Admin API credentials.

11. Bundle Cart Metadata

Where supported by the existing architecture, attach bundle identification metadata to cart items.

Example conceptual metadata:

bundle_id
bundle_name
bundle_type
bundle_instance_id

This metadata will help the system associate cart activity with a BundleCraft bundle.

Do not store sensitive merchant information in cart metadata.

12. Cart Validation

Before adding a bundle to cart, validate:

Bundle exists
Bundle is active
Products are valid
Required quantity is satisfied
Variants are valid
Selection rules are satisfied

If validation fails:

Do not add products to cart.
Display a clear customer-friendly error.

Do not expose internal validation details.

13. Fixed Bundle Cart Flow

For a Fixed Bundle:

Load bundle
    ↓
Load included products
    ↓
Validate products
    ↓
Create cart items
    ↓
Add all bundle products

The customer should not be required to make additional product selections unless the bundle configuration requires it.

14. Quantity Bundle Cart Flow

For a Quantity Bundle:

Load bundle
    ↓
Display available products
    ↓
Customer selects required quantity
    ↓
Validate selection count
    ↓
Create cart items
    ↓
Add selected products

Do not allow fewer selections than required.

Do not allow invalid selections.

15. Mix & Match Cart Flow

For Mix & Match:

Load bundle
    ↓
Display available products
    ↓
Customer selects products
    ↓
Validate required quantity
    ↓
Create cart items
    ↓
Add selected products

Prevent duplicate selections where the bundle configuration does not permit them.

Follow the bundle rules defined by the Bundle Engine.

16. Bundle Landing Page

Implement the bundle landing page experience described in the PRD.

The intended location is:

/collections/bundles

The page should provide a customer-friendly way to discover available bundles.

Conceptual structure:

BundleCraft Bundles

[ Bundle Card ]
Complete Look
3 Products
Save 10%
[ View Bundle ]

[ Bundle Card ]
Skincare Routine
5 Products
Save 15%
[ View Bundle ]

Only active bundles should be displayed.

17. Bundle Landing Page Cards

Each bundle card may include:

Bundle image/visual
Bundle name
Bundle type
Product count
Discount
Short description
View bundle button

Use reusable components.

Example:

components/
└── storefront/
    ├── BundleCard
    ├── BundleGrid
    ├── BundleWidget
    ├── ProductSelector
    ├── VariantSelector
    ├── BundlePreview
    └── AddBundleButton

Adapt the structure to the existing project.

18. Customer UX

The storefront experience should be:

Simple
Fast
Mobile-first
Visually clear
Easy to understand
Low-friction

Customers should immediately understand:

What is this bundle?
What products are included?
How many products can/must I select?
What discount is available?
How do I add it to cart?

Avoid unnecessary steps.

19. Mobile Responsiveness

The storefront widget must work on:

Mobile
Tablet
Desktop

Test:

Product cards
Variant selectors
Quantity controls
Buttons
Bundle layout
Product grids
Landing page
Error messages

Do not allow horizontal overflow.

20. Accessibility

Implement basic accessibility requirements.

Include:

Semantic HTML
Keyboard navigation
Accessible buttons
Accessible form controls
Labels for selectors
Focus states
Screen-reader-friendly status messages

Do not rely only on color to indicate selected products.

21. Loading States

Implement loading states for:

Bundle retrieval
Product retrieval
Variant retrieval
Cart operation

Avoid blank UI while asynchronous operations are running.

Use lightweight loading indicators appropriate for storefront performance.

22. Error States

Handle:

Bundle not found
Bundle inactive
Network error
Invalid product
Invalid variant
Invalid selection
Cart failure
Backend failure

Customer-facing errors must be simple.

Example:

This bundle is currently unavailable.
Please try again later.

Do not display:

Prisma error
Database exception
Stack trace
Shopify token error
23. Analytics Integration Points

The storefront should provide integration points for:

bundle_view
bundle_add

The analytics system will be implemented separately.

For this action:

Trigger the appropriate event request when a bundle is viewed.
Trigger the appropriate event request when a bundle is added to cart.
Keep analytics calls isolated from the main UI logic.
Do not implement the complete analytics engine.

Example conceptual flow:

Bundle rendered
    ↓
bundle_view

Add Bundle clicked successfully
    ↓
bundle_add

If the analytics endpoint is not yet available, create a clean service boundary rather than hardcoding analytics logic inside components.

24. Performance Requirements

The storefront widget must be lightweight.

Avoid:

Large unnecessary dependencies
Blocking scripts
Unnecessary API calls
Duplicate product requests
Excessive JavaScript
Large bundle assets

Load bundle information efficiently.

Do not load the entire merchant dashboard application on the storefront.

The customer-facing widget should contain only the code required for the storefront experience.

25. Caching

Where appropriate, use caching for data that does not change frequently.

Do not cache data in a way that could cause inactive bundles to remain visible indefinitely.

When a bundle becomes inactive, the storefront should eventually stop rendering it according to the application's cache strategy.

Follow the project's existing architecture rather than introducing an unrelated caching system.

26. Security

The storefront must:

Never expose Admin API tokens
Never expose database credentials
Never expose private environment variables
Validate bundle IDs
Validate storefront requests
Avoid trusting arbitrary client-side bundle configuration
Only render active bundles

Do not put secrets inside:

Theme App Extension JavaScript
Browser JavaScript
Public environment variables
HTML data attributes
27. Merchant Isolation

A storefront request must resolve against the correct Shopify shop/store context.

Never allow a customer request to retrieve arbitrary merchant data.

The implementation must prevent:

Shop A
   ↓
Customer request
   ↓
Shop B private bundle data

Only public storefront-safe bundle information should be returned.

28. Bundle Engine Integration

The storefront should consume the Bundle Engine created in:

ACTION-005-bundle-engine.md

Do not recreate bundle validation rules in multiple places.

Where practical:

Storefront
    ↓
Bundle API/Service
    ↓
Bundle Validation

The storefront may perform basic UI validation for UX, but server-side validation remains authoritative.

29. Dashboard Integration

The merchant dashboard created in:

ACTION-004-merchant-dashboard.md

should remain independent from the storefront runtime.

Do not import the complete dashboard into the storefront.

Reuse only shared components/utilities where appropriate.

30. Theme App Extension Structure

Use the Shopify Theme App Extension structure supported by the project's Shopify architecture.

Possible structure:

extensions/
└── bundle-widget/
    ├── blocks/
    ├── assets/
    ├── snippets/
    ├── locales/
    └── shopify.extension.toml

The exact structure must follow the Shopify app configuration already established in the project.

Do not create a second Shopify extension configuration.

31. Bundle Widget Settings

Where supported by the chosen Theme App Extension architecture, expose merchant-configurable settings for the widget.

Potential settings:

Bundle selection
Widget layout
Primary color
Button color
Background color
Font size

Do not duplicate the entire merchant dashboard customization system.

The extension should consume the saved bundle configuration.

32. Storefront Bundle URL

For bundle-specific views, use a consistent URL structure.

If the project architecture requires bundle-specific routes, follow the existing routing strategy.

Do not introduce URL patterns that conflict with:

/collections/bundles

or existing Shopify routes.

33. Testing

Create tests for the storefront functionality.

At minimum test:

Bundle Rendering
Active bundle renders
Inactive bundle does not render
Missing bundle handled correctly
Fixed Bundle
Products render
Add to cart works
Invalid bundle blocked
Quantity Bundle
Selection count works
Under-selection blocked
Valid quantity accepted
Mix & Match
Product selection works
Required quantity enforced
Invalid selection blocked
Variants
Variant selection works
Correct variant added to cart
Cart
Correct products added
Bundle metadata handled
Cart error handled
Analytics
Bundle view event triggered
Bundle add event triggered
Responsive
Mobile layout works
Desktop layout works
34. Performance Validation

Check:

Storefront bundle size
Network requests
Unnecessary API calls
Rendering performance
Mobile responsiveness
Loading behavior

Do not introduce unnecessary dependencies.

35. Do NOT Implement In This Action

Do NOT implement:

Shopify Functions discount logic
Automatic discount execution
Shopify Billing
Subscription management
Analytics database engine
Analytics reporting engine
Merchant dashboard redesign
Admin OAuth
Product catalog management
Customer account system

Those belong to other actions.

36. Expected Files

The exact structure depends on the current project.

Potential files:

extensions/
└── bundle-widget/
    ├── blocks/
    ├── assets/
    ├── locales/
    └── shopify.extension.toml

components/
└── storefront/
    ├── BundleWidget
    ├── BundleCard
    ├── BundleGrid
    ├── ProductSelector
    ├── VariantSelector
    ├── BundlePreview
    └── AddBundleButton

lib/
└── storefront/
    ├── bundle-client
    ├── cart
    └── analytics

Only create files that are necessary.

Adapt naming to the existing codebase.

37. Implementation Rules

Before implementation:

Inspect the current repository.
Read all required documentation.
Inspect Shopify app configuration.
Inspect existing Theme App Extension configuration if present.
Inspect Bundle Engine APIs.
Inspect authentication and shop context handling.
Inspect existing API utilities.
Reuse existing utilities.
Do not duplicate bundle validation logic unnecessarily.
Do not expose private credentials.

Do not rewrite unrelated functionality.

38. TypeScript Requirements

Use strict TypeScript.

Avoid:

any

unless absolutely necessary.

Define clear types for:

Bundle
BundleProduct
BundleType
BundleStatus
BundleCustomization
Product
Variant
CartItem
BundleSelection

Keep types consistent with the backend.

39. Validation Checklist

Before completing this action:

Product Page Widget
 Widget renders
 Active bundles display
 Inactive bundles do not display
 Product information displays
 Variant selection works
 Responsive layout works
Fixed Bundle
 Included products display
 Bundle can be added to cart
 Invalid bundle blocked
Quantity Bundle
 Product selection works
 Required quantity enforced
 Invalid quantity blocked
Mix & Match
 Product selection works
 Required selection enforced
 Invalid selection blocked
Cart
 Correct products added
 Correct variants added
 Bundle metadata handled
 Cart errors handled
Bundle Landing Page
 /collections/bundles works according to the project architecture
 Active bundles display
 Bundle cards work
 Bundle navigation works
 Mobile layout works
Analytics Integration
 bundle_view integration exists
 bundle_add integration exists
Security
 No Admin API token exposed
 No database credentials exposed
 No private environment variables exposed
 Public storefront data is restricted
 Merchant isolation is maintained
Code Quality
 TypeScript passes
 Lint passes
 Tests pass
 Build passes
40. Final Verification Commands

Run only commands that actually exist in the project.

Possible commands:

npm run lint
npm run typecheck
npm test
npm run build

If Shopify extension validation/build commands exist in the project, run the appropriate existing commands.

Do not invent commands.

41. Completion Report

After implementation, provide a concise report containing:

Summary

Explain what was implemented.

Storefront Features

List:

Product page widget
Bundle landing page
Fixed Bundle support
Quantity Bundle support
Mix & Match support
Variant selection
Cart integration
Customization rendering
Responsive UI
Shopify Extension

Explain what Theme App Extension components were created.

API Integration

List the backend APIs/services consumed.

Analytics Integration

Confirm the integration points for:

bundle_view
bundle_add
Security

Explain how private credentials and merchant data are protected.

Tests

Report:

Lint
TypeScript
Unit tests
Integration tests
Build
Shopify extension validation, if applicable
Issues

List any blockers or incomplete integrations.

Next Action

The next implementation phase is:

ACTION-007 — Discount Function

Do not start ACTION-007 automatically.

Wait for explicit instruction before implementing the next action.
```
