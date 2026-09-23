# BundleCraft Storefront Widget Architecture

## Purpose

Create a fast, beautiful, mobile-first bundle shopping experience for Shopify customers.

The widget is the main customer-facing feature.

---

# Widget Types

BundleCraft supports:

## 1. Product Page Widget

Location:

Shopify Product Page

Example:

Complete Your Look

---

✓ Shirt

✓ Jeans

✓ Shoes

Bundle Price:

$149

Save:

$30

[ Add Bundle ]

---

## 2. Bundle Landing Page

URL:

/collections/bundles

Purpose:

Show all available bundles.

---

# Widget Technology

Built using:

Shopify Theme App Extension

Frontend:

- React
- TypeScript
- Shopify Extension APIs

---

# Widget Flow

Customer visits product page

↓

Widget loads bundle configuration

↓

Fetch bundle data

↓

Display products

↓

Customer selects products

↓

Click Add Bundle

↓

Products added to Shopify cart

↓

Checkout

---

# Widget Features

Merchant controls:

- Colors
- Typography
- Button style
- Layout

Layouts:

Card

Horizontal

Vertical

---

# Performance Requirements

Widget must:

- Load fast
- Avoid blocking theme
- Use lazy loading
- Minimize JavaScript

---

# Mobile First

Priority:

Mobile shopping experience.

Must support:

- Small screens
- Touch interaction
- Fast loading

---

# Future Features

Support:

- Bundle recommendations
- AI suggestions
- Personalized bundles
