# Phase 05 - Bundle Engine Implementation

## Objective

Implement the core BundleCraft bundle management engine.

This phase creates the complete business logic required for merchants to:

- Create bundles
- Manage bundle products
- Configure discounts
- Publish bundles
- Update bundles
- Delete bundles

---

# Bundle Engine Responsibilities

The bundle engine manages:

- Bundle creation
- Bundle validation
- Product relationships
- Pricing logic
- Discount calculation
- Bundle status management
- Publishing workflow

---

# Supported Bundle Types

BundleCraft MVP supports three bundle types:

## 1. Fixed Bundle

Purpose:

Create a predefined product package.

Example:

Summer Outfit Bundle

Products:

- T-Shirt
- Jeans
- Cap

Bundle Price:

$99

Logic:

Merchant selects products.

Merchant sets fixed bundle discount.

Customer buys complete bundle.

---

# 2. Quantity Bundle

Purpose:

Provide discount based on quantity.

Example:

Buy 3 T-Shirts

Get 15% OFF

Logic:

Customer quantity reaches required amount.

Discount is applied.

---

# 3. Mix & Match Bundle

Purpose:

Allow customers to select products.

Example:

Choose any 3 products

Get 20% discount

Logic:

Customer chooses products from allowed list.

System validates selection quantity.

Discount applied.

---

# Bundle Data Structure

Bundle contains:

Bundle

|

├── Products

|

├── Discount Rules

|

├── Customization

|

└── Analytics

---

# Bundle Creation Flow

Merchant opens Create Bundle

↓

Select Bundle Type

↓

Select Products

↓

Configure Discount

↓

Customize Appearance

↓

Save Draft

↓

Publish Bundle

---

# Bundle CRUD Operations

Implement:

## Create Bundle

API:

POST /api/bundles

Requirements:

- Validate shop ownership
- Validate products
- Create bundle record
- Create bundle products

---

## Get Bundles

API:

GET /api/bundles

Requirements:

Return only authenticated merchant bundles.

---

## Get Single Bundle

API:

GET /api/bundles/:id

Requirements:

Verify bundle belongs to current shop.

---

## Update Bundle

API:

PUT /api/bundles/:id

Allow update:

- Title
- Products
- Discount
- Status
- Customization

---

## Delete Bundle

API:

DELETE /api/bundles/:id

Requirements:

Remove bundle safely.

---

# Product Selection System

Merchant can:

- Search Shopify products
- Select products
- Select variants
- Set quantity
- Change product order

---

# Product Validation

Before saving bundle:

Check:

✓ Product exists

✓ Variant exists

✓ Product belongs to Shopify store

✓ Bundle has required products

---

# Discount Engine

Create reusable discount calculation service.

Example:

Input:

Products:

$150

Discount:

20%

Output:

Final Price:

$120

---

# Discount Types

## Percentage Discount

Example:

20% OFF

Formula:

final_price = total_price - (total_price \* discount_percentage)

---

## Fixed Amount Discount

Example:

Save $30

Formula:

final_price = total_price - fixed_amount

---

# Bundle Status System

Bundle statuses:

## Draft

Bundle created but not visible.

## Active

Bundle published and available.

## Inactive

Bundle disabled.

---

# Publishing Workflow

When merchant publishes:

Validate:

✓ Bundle has products

✓ Discount configured

✓ Widget settings completed

Then:

Update status:

draft → active

---

# Bundle Service Layer

Create separate business logic layer.

Example:

services/

bundle/

createBundle.ts

updateBundle.ts

deleteBundle.ts

calculateDiscount.ts

validateBundle.ts

---

# Database Integration

Use Prisma.

Required models:

Bundle

BundleProduct

Customization

---

# Error Handling

Handle:

Invalid product

Missing products

Invalid discount

Unauthorized shop

Deleted bundle

Return proper error messages.

---

# API Requirements

Required endpoints:

POST

/api/bundles

GET

/api/bundles

GET

/api/bundles/:id

PUT

/api/bundles/:id

DELETE

/api/bundles/:id

---

# Testing Requirements

Test:

## Fixed Bundle

✓ Create fixed bundle

✓ Calculate discount

✓ Publish bundle

## Quantity Bundle

✓ Quantity validation

✓ Discount calculation

## Mix Match Bundle

✓ Product selection

✓ Minimum quantity validation

---

# Performance Requirements

Optimize:

- Product queries
- Bundle fetching
- Database relations

Use:

- Proper Prisma queries
- Database indexes
- Server-side validation

---

# Expected Output

After completing this phase:

✓ Bundle CRUD completed

✓ Three bundle types implemented

✓ Product selection working

✓ Discount engine working

✓ Validation implemented

✓ Publishing workflow completed

✓ Service layer created

---

# Files Expected To Create

Example:

services/

bundle/

createBundle.ts

updateBundle.ts

deleteBundle.ts

calculateDiscount.ts

validateBundle.ts

lib/

bundle/

types.ts

constants.ts

api/

bundles/

route.ts

[bundleId]/

route.ts

---

# Development Rules

During implementation:

1. Keep business logic separate from UI.

2. Create reusable services.

3. Never hardcode discount rules.

4. Support future bundle types.

5. Follow clean architecture.

---

# Completion Report

After finishing this phase provide:

## Summary

Features implemented.

## Bundle Types

List supported types.

## APIs Created

List endpoints.

## Services Created

List service files.

## Testing

Tests performed.

## Issues

Remaining tasks.
