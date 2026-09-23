# Phase 06 - Storefront Widget Implementation

## Objective

Build the customer-facing Shopify storefront experience for BundleCraft.

The widget allows Shopify customers to discover, customize, and purchase product bundles directly from the storefront.

---

# Widget Goals

The storefront experience must:

- Look premium
- Load fast
- Work on mobile devices
- Match merchant branding
- Increase bundle conversions
- Provide smooth checkout experience

---

# Shopify Technologies

Use:

## Theme App Extension

Purpose:

Embed BundleCraft widgets into Shopify themes.

## Storefront API

Purpose:

Handle:

- Product data
- Cart operations
- Customer storefront interactions

---

# Widget Types

BundleCraft supports:

## 1. Product Page Widget

Location:

Shopify Product Page

Example:

Complete Your Look

[ Product Image ]

Shirt ✓

[ Product Image ]

Jeans ✓

[ Product Image ]

Shoes ✓

Bundle Price:

$149

Save $30

[ Add Bundle ]

---

## 2. Bundle Landing Page

Purpose:

Display all active bundles.

Example:

URL:

/collections/bundles

Features:

- Bundle cards
- Product preview
- Discount information
- Add bundle button

---

# Widget Architecture

Shopify Theme

|

Theme App Extension

|

BundleCraft Widget

|

Bundle API

|

Database

---

# Theme App Extension Setup

Create Shopify theme extension.

Required:

- Extension configuration
- Liquid blocks
- React components
- Styling system

---

# Widget Data Flow

Customer opens product page

↓

Theme extension loads

↓

Request bundle configuration

↓

Fetch active bundle data

↓

Render widget

↓

Customer selects products

↓

Add bundle to cart

↓

Checkout

---

# Bundle Fetching

Widget should only display:

- Active bundles
- Published bundles
- Current merchant bundles

Never display:

- Draft bundles
- Inactive bundles

---

# Widget Components

Create reusable components:

components/widget/

BundleCard.tsx

ProductSelector.tsx

BundlePrice.tsx

DiscountBadge.tsx

AddBundleButton.tsx

---

# Widget Layout Options

Support merchant customization:

## Card Layout

Products displayed as cards.

---

## Horizontal Layout

Products displayed in row.

---

## Vertical Layout

Products displayed vertically.

---

# Merchant Customization Rendering

Widget should support:

Colors:

- Primary color
- Button color
- Background color

Typography:

- Font size

Layout:

- Card
- Horizontal
- Vertical

---

# Add Bundle To Cart Flow

Customer clicks:

Add Bundle

System:

1. Validate selected products

2. Fetch product variants

3. Create cart items

4. Add items to Shopify cart

5. Redirect customer to cart/checkout

---

# Cart Integration Requirements

Support:

- Multiple products
- Product variants
- Quantities
- Bundle identification

Cart data should include:

Bundle ID

for analytics tracking.

---

# Storefront API Integration

Use Storefront API for:

- Product information
- Variant information
- Cart operations

---

# Performance Requirements

Widget must:

- Load asynchronously
- Avoid blocking storefront
- Minimize JavaScript
- Optimize API requests

---

# Mobile Requirements

Must support:

- Responsive layout
- Touch interactions
- Mobile checkout flow
- Small screen devices

---

# Error Handling

Handle:

Product unavailable

Variant unavailable

Bundle removed

Network failure

Cart errors

Show customer-friendly messages.

---

# Analytics Integration Preparation

Widget should trigger events:

## Bundle View

When widget appears.

Event:

bundle_view

---

## Bundle Add

When customer clicks add bundle.

Event:

bundle_add

---

# Security Requirements

Widget must:

- Validate bundle status
- Validate product availability
- Never expose private Shopify tokens
- Use secure APIs

---

# API Requirements

Required backend endpoints:

GET

/api/storefront/bundles

Purpose:

Fetch active bundles.

---

POST

/api/storefront/cart

Purpose:

Create bundle cart action.

---

POST

/api/analytics/event

Purpose:

Track widget events.

---

# Expected Output

After completing this phase:

✓ Theme App Extension created

✓ Product page widget working

✓ Bundle landing page structure created

✓ Storefront API connected

✓ Add bundle to cart working

✓ Customization rendering working

✓ Mobile responsive design completed

---

# Files Expected To Create

Example:

extensions/

bundle-widget/

blocks/

bundle-widget.liquid

assets/

bundle-widget.tsx

styles.css

components/

widget/

BundleCard.tsx

ProductSelector.tsx

AddBundleButton.tsx

app/

api/

storefront/

bundles/

cart/

---

# Testing Requirements

Test:

## Widget Display

✓ Widget appears on product page

## Bundle Loading

✓ Active bundles load correctly

## Cart Test

✓ Multiple products added

## Mobile Test

✓ Responsive on mobile

## Theme Test

✓ Works on Shopify themes

---

# Development Rules

During implementation:

1. Follow Shopify Theme App Extension standards.

2. Do not inject scripts directly into themes.

3. Keep widget lightweight.

4. Never expose private credentials.

5. Build reusable storefront components.

---

# Completion Report

After finishing this phase provide:

## Summary

What storefront features were implemented.

## Extensions Created

List Shopify extensions.

## Components Created

List components.

## APIs Connected

List APIs.

## Testing

Tests performed.

## Issues

Remaining tasks.
