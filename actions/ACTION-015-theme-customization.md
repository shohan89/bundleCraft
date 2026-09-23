# ACTION-015 — Storefront Theme Customization

## Objective

Implement the BundleCraft storefront customization system so merchants can control the visual appearance of their bundle experiences without writing code.

The customization system must support the MVP requirements defined in the PRD:

- Primary color
- Button color
- Background
- Typography
- Font size
- Card layout
- Horizontal layout
- Vertical layout

The customization must work consistently across:

- Bundle Landing Page
- Product Page Bundle Widget
- Bundle Selection Experience

The merchant's customization settings must be stored, validated, and safely rendered on the Shopify storefront.

Do not implement unrelated features.

---

# Required Documentation To Read First

Before writing any code, Claude Code MUST read:

1. `CLAUDE.md`
2. `docs/01-PRD.md`
3. `docs/02-ARCHITECTURE.md`
4. `docs/04-DATABASE_DESIGN.md`
5. `docs/05-SHOPIFY_INTEGRATION.md`
6. `docs/08-STOREFRONT_WIDGET.md`
7. `docs/09-BUNDLE_ENGINE.md`
8. `docs/10-MERCHANT_DASHBOARD.md`
9. `docs/13-SECURITY.md`
10. `docs/14-TESTING_STRATEGY.md`

Also inspect:

```text
actions/ACTION-004-merchant-dashboard.md
actions/ACTION-005-bundle-engine.md
actions/ACTION-006-storefront-widget.md
actions/ACTION-013-bundle-landing-page.md
actions/ACTION-014-template-system.md

Read the actual existing implementation before making changes.

Do not assume previous actions were implemented exactly as planned.

Role

Act as a senior Shopify SaaS UI engineer responsible for building a scalable merchant-controlled storefront customization system.

The system must be:

Easy for non-technical merchants
Safe
Responsive
Performant
Consistent
Reusable
Compatible with the existing storefront architecture

Do not create a separate visual system for every storefront component.

Scope

Implement:

Customization data model verification/extension
Merchant customization UI
Color customization
Background customization
Typography customization
Font size customization
Layout customization
Live preview
Save/update customization
Reset/default customization
Storefront rendering
Validation
Responsive behavior
Accessibility
Tests
1. Inspect Existing Customization Model

First inspect the existing Prisma schema and customization implementation.

The PRD requires customization for:

Primary Color
Button Color
Background
Typography
Font Size
Layout

Check whether the existing:

Customization

model already supports these values.

Do not create duplicate customization models.

If the existing model is incomplete, extend it carefully.

2. Customization Architecture

The intended architecture should be:

Merchant Dashboard
        ↓
Customization Editor
        ↓
Validation
        ↓
Database
        ↓
Bundle Configuration
        ↓
Storefront
        ↓
Rendered Bundle Experience

Customization should remain separate from the Bundle Engine's business logic.

The Bundle Engine determines:

Products
Bundle type
Rules
Discount configuration

Customization determines:

Appearance
Layout
Typography
Visual presentation
3. Customization Data Structure

Inspect the existing Customization model before implementation.

Potential fields may include:

id
bundleId
primaryColor
buttonColor
backgroundColor
fontFamily
fontSize
layout
createdAt
updatedAt

Use only fields required by the current architecture.

Do not add unnecessary visual settings.

4. Primary Color

Implement merchant control over the primary color.

The primary color may be used for:

Headings
Accent elements
Selection states
Borders
Supporting UI elements

Validate the value before saving.

Accept a safe color representation supported by the existing UI system.

Do not allow arbitrary CSS injection.

5. Button Color

Implement button color customization.

The button color may be applied to:

Primary CTA
Add Bundle button
Selection actions
Important interactive controls

The button must remain accessible against its text color.

Do not allow merchants to inject arbitrary CSS.

6. Background

Support bundle background customization.

Possible values:

Solid color

If the existing architecture only supports a color background, do not implement:

Background videos
Custom HTML
Arbitrary CSS
External scripts

Keep the MVP implementation simple and safe.

7. Typography

Implement typography customization based on the existing PRD and architecture.

The merchant should be able to select a supported typography option.

If the current implementation uses a predefined font list, use that list.

Do not allow arbitrary external font URLs.

Potential structure:

fontFamily

The system should use a safe allowlist.

8. Font Size

Implement configurable font sizing.

At minimum support the application's defined/default font size options.

For example:

Small
Medium
Large

or the actual supported values in the existing UI system.

Do not allow arbitrary CSS expressions.

Validate the selected value before saving.

9. Layout Options

The PRD specifies:

Card
Horizontal
Vertical

Implement these as merchant-selectable options.

Example:

Card Layout
Horizontal Layout
Vertical Layout

The selected layout must affect the storefront rendering.

Do not duplicate layout logic in multiple components.

Create reusable layout components or a shared layout system.

10. Layout Architecture

Use a configuration-driven approach.

Conceptually:

Customization
     ↓
layout = "card"
     ↓
BundleLayoutRenderer
     ↓
CardLayout

or:

layout = "horizontal"
     ↓
HorizontalLayout

and:

layout = "vertical"
     ↓
VerticalLayout

The exact implementation should follow the existing component architecture.

11. Merchant Dashboard UI

Integrate customization controls into the existing Create Bundle flow and/or bundle editor.

The merchant should be able to easily find:

Design

or equivalent customization section.

The UI should expose:

Primary Color
Button Color
Background
Typography
Font Size
Layout

Do not create a separate dashboard application.

Reuse existing dashboard components.

12. Color Picker

Use an appropriate color input.

The merchant should be able to:

Select a color
Enter a valid color value if supported
See the current selected color

Invalid color values must be rejected.

Do not accept arbitrary CSS declarations.

13. Live Preview

Implement a live preview where practical.

Expected flow:

Merchant changes color
        ↓
Preview updates
        ↓
Merchant reviews
        ↓
Save

The preview should use the same rendering components as the storefront where practical.

Avoid maintaining two completely different visual implementations.

14. Preview Data

The customization preview should not require the merchant to publish the bundle.

Use representative bundle/product data when necessary.

Do not expose real customer data.

The preview should demonstrate:

Bundle title
Product cards
CTA
Layout
Colors
Typography

Use actual bundle data when available.

15. Save Customization

Implement saving customization changes.

The save flow should be:

Merchant
   ↓
Change customization
   ↓
Validate
   ↓
Save
   ↓
Database
   ↓
Success state

Use the existing API conventions.

Potential endpoint:

PUT /api/bundles/:id/customization

If the current API architecture uses another structure, follow that architecture instead.

16. Authorization

Only the merchant who owns the bundle may update its customization.

The backend must verify:

Authenticated Shop
        ↓
Bundle.shopId
        ↓
Match

Never trust a shop ID sent by the browser.

17. Default Customization

Every bundle should have a safe default customization.

If a merchant has not customized a bundle, the storefront should still render correctly.

Define a centralized default configuration.

For example:

Primary Color → default
Button Color → default
Background → default
Typography → default
Font Size → default
Layout → default

Do not scatter defaults across multiple React components.

18. Reset Customization

Provide a reset mechanism where appropriate.

Expected behavior:

Reset
 ↓
Restore default configuration
 ↓
Preview updates
 ↓
Merchant saves

Do not automatically overwrite saved settings without user action.

19. Storefront Rendering

Update the storefront rendering system so customization values are actually applied.

The customization must work with:

Bundle Landing Page
Product Page Bundle Widget
Bundle Selection Experience

Reuse the same customization configuration.

Do not create separate customization formats for each storefront surface.

20. CSS Architecture

Prefer a controlled CSS architecture.

Possible approach:

Bundle root
   ↓
CSS variables
   ↓
Reusable components

For example:

--bundle-primary-color
--bundle-button-color
--bundle-background
--bundle-font-size

Only use values validated by the application.

Do not inject arbitrary merchant-provided CSS.

21. CSS Injection Security

This is critical.

Never allow merchant input to become arbitrary:

<style>

or:

<script>

or:

javascript:

or arbitrary CSS declarations.

Customization values must be sanitized and validated before rendering.

22. Typography Security

If the merchant can select fonts, use a controlled allowlist.

Do not allow:

https://example.com/font.css

or arbitrary external resources.

If the project already has a supported font system, reuse it.

23. Accessibility

Customization must not make the storefront inaccessible.

Check:

Text contrast
Button contrast
Focus states
Keyboard navigation
Readable font sizes
Semantic HTML
Screen reader labels

If a merchant selects a low-contrast color combination, provide an appropriate warning or safe behavior where practical.

Do not silently break accessibility.

24. Responsive Behavior

All customization options must work on:

Mobile
Tablet
Desktop

Layout settings must adapt appropriately.

For example:

Horizontal Layout

may need to stack on narrow screens if required for usability.

Do not allow merchant customization to create horizontal overflow.

25. Storefront Performance

Customization should not introduce significant performance overhead.

Avoid:

Large runtime style systems
Repeated API requests
Loading external font resources unnecessarily
Re-rendering unrelated components

Use lightweight configuration-driven rendering.

26. Caching

Where appropriate, storefront customization can be cached or included with bundle configuration.

Do not introduce a complex caching system unless the existing architecture requires it.

The priority is correctness and simplicity.

27. Validation

Validate all customization values server-side.

Validate:

primaryColor
buttonColor
backgroundColor
fontFamily
fontSize
layout

The backend must reject invalid values even if the frontend validates them.

Never rely only on client-side validation.

28. API Security

Customization APIs must:

Require authentication
Verify bundle ownership
Validate input
Prevent cross-shop access
Avoid leaking internal data
Use existing authentication middleware

Do not create a separate authentication mechanism.

29. Testing

Create tests for:

Colors
Valid primary color
Valid button color
Invalid color
Malicious CSS input
Typography
Supported font
Unsupported font
Invalid font size
Layout
Card
Horizontal
Vertical
Invalid layout
Authorization
Correct shop can update
Other shop cannot update
Defaults
New bundle gets defaults
Missing customization falls back safely
Reset
Reset restores defaults
Storefront
Customization renders correctly
Different layouts render correctly
Invalid customization does not break storefront
Accessibility
Button contrast
Keyboard interaction
Focus states
30. Type Safety

Use TypeScript.

Avoid unnecessary:

any

Create appropriate types/enums for:

BundleLayout
FontFamily
FontSize
Customization

Validate API payloads before database updates.

31. Documentation Updates

After implementation update relevant documentation where necessary.

Potential files:

docs/04-DATABASE_DESIGN.md
docs/08-STOREFRONT_WIDGET.md
docs/09-BUNDLE_ENGINE.md
docs/10-MERCHANT_DASHBOARD.md
docs/13-SECURITY.md
docs/14-TESTING_STRATEGY.md

Document actual implementation details only.

Do not rewrite unrelated documentation.

32. Validation Commands

Run the actual project validation commands.

Attempt:

npm run lint
npm run typecheck
npm test
npm run build

If a command does not exist:

Do not invent it.
Use the project's actual equivalent if available.
Report it honestly.
33. Final Verification Checklist

Before marking this action complete:

 Existing customization model inspected
 Customization schema implemented/extended if required
 Primary color implemented
 Button color implemented
 Background implemented
 Typography implemented
 Font size implemented
 Card layout implemented
 Horizontal layout implemented
 Vertical layout implemented
 Dashboard customization UI implemented
 Color picker implemented
 Live preview implemented
 Save customization implemented
 Authorization implemented
 Default customization implemented
 Reset functionality implemented
 Storefront rendering updated
 CSS variables/configuration system implemented where appropriate
 CSS injection protection implemented
 Typography allowlist implemented
 Accessibility reviewed
 Responsive behavior reviewed
 Performance reviewed
 Server-side validation implemented
 Tests created
 Lint checked
 Typecheck checked
 Tests checked
 Build checked
 Documentation updated where necessary
Important Restrictions

DO NOT implement:

Arbitrary custom CSS editor
Custom JavaScript
External script injection
Custom HTML editor
Custom font URL upload
Advanced theme builder
AI-generated designs
Video backgrounds
Subscription bundles
Gift bundles
BOGO
Volume bundles
Multi-currency
Multilingual customization
B2B customization
New billing functionality
New analytics functionality

Keep this action focused on:

MVP Storefront Theme Customization.

Completion Report

When finished, provide:

1. Implementation Summary

Explain what was implemented.

2. Customization Options

List the supported customization options.

3. Files Created

List every new file.

4. Files Modified

List every modified file.

5. Database Changes

List Prisma/schema/migration changes.

6. Dashboard Integration

Explain where merchants configure the design.

7. Storefront Integration

Explain how customization reaches the storefront.

8. Security

Explain how arbitrary CSS/script injection is prevented.

9. Accessibility

Explain how contrast, focus, keyboard navigation, and responsive behavior were handled.

10. Tests

List tests created and actual results.

11. Validation

Report actual results:

Lint:
Typecheck:
Tests:
Build:
12. Issues

List unresolved issues honestly.

Do not claim Shopify production verification unless it was actually performed.

13. Next Action

After completing this action, the next planned action is:

ACTION-016-performance-optimization.md

Do not execute the next action automatically.
```
