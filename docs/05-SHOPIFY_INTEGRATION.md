# Shopify Integration Architecture

## Objective

Integrate BundleCraft with Shopify ecosystem using official APIs and extensions.

---

# Shopify Components

BundleCraft uses:

1. Shopify Admin API

2. Shopify Storefront API

3. Theme App Extension

4. Shopify Functions

---

# 1. Shopify Admin API

Purpose:

Merchant dashboard operations.

Used for:

## Products

Fetch:

- Products
- Variants
- Inventory

Example:

Merchant creates bundle:

↓

App fetches products

↓

Merchant selects products

---

## Orders

Used for:

Analytics tracking

Revenue calculation

---

# 2. Storefront API

Purpose:

Customer-facing experience.

Used for:

- Product information
- Cart operations
- Bundle display

---

# 3. Theme App Extension

Purpose:

Display bundle widgets inside Shopify storefront.

Widget locations:

Product Page

Example:

Complete Your Look

Shirt ✓

Jeans ✓

Shoes ✓

Add Bundle $149

Save $30

---

# 4. Shopify Functions

Purpose:

Handle automatic discount logic.

Example:

Normal price:

$150

Bundle price:

$120

Function applies:

$30 discount

---

# Shopify App Flow

Merchant installs app

↓

OAuth approval

↓

Store information saved

↓

Dashboard access

↓

Create bundle

↓

Publish widget

↓

Customer purchases bundle

---

# Required Shopify Permissions

Products:

read_products

Orders:

read_orders

Themes:

write_themes

Customers:

(optional future)

---

# Extension Architecture

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

# Future Shopify Features

Support:

- Shopify Markets
- Multiple currencies
- B2B Shopify
- Checkout extensions
