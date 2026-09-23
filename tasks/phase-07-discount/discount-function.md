# Phase 07 - Shopify Discount Function Implementation

## Objective

Implement Shopify Functions based discount engine for BundleCraft.

The goal of this phase is to automatically apply bundle discounts during Shopify checkout.

The system must support:

- Percentage discounts
- Fixed amount discounts
- Bundle validation
- Checkout discount application
- Future discount expansion

---

# Shopify Technology

Use:

Shopify Functions

Purpose:

Execute discount logic directly inside Shopify checkout.

---

# Discount Architecture

Customer Cart

|

Shopify Checkout

|

Shopify Function

|

BundleCraft Discount Logic

|

Apply Discount

---

# Discount Flow

Customer adds bundle to cart

↓

Cart contains bundle products

↓

Shopify Discount Function executes

↓

Function identifies bundle items

↓

Validate bundle rules

↓

Calculate discount

↓

Apply discount at checkout

---

# Supported Discount Types

BundleCraft MVP supports:

## 1. Percentage Discount

Example:

Bundle price:

$150

Discount:

20%

Final price:

$120

Formula:

discount = total_price \* percentage

---

## 2. Fixed Amount Discount

Example:

Bundle price:

$150

Discount:

$30

Final price:

$120

Formula:

discount = fixed_amount

---

# Bundle Identification

Every bundle purchase must contain:

Bundle ID

inside cart metadata.

Example:

cart attribute:

bundle_id:

abc123

Purpose:

Allow Shopify Function to identify bundle products.

---

# Discount Validation

Before applying discount:

Validate:

✓ Bundle exists

✓ Bundle is active

✓ Products belong to bundle

✓ Discount rules valid

✓ Customer cart matches requirements

---

# Shopify Function Requirements

Create:

Discount Function Extension

Responsibilities:

- Read cart data
- Match bundle rules
- Calculate discount
- Return discount response

---

# Discount Logic Service

Create reusable service.

Example:

services/

discount/

calculatePercentageDiscount.ts

calculateFixedDiscount.ts

validateBundleDiscount.ts

---

# Discount Rules

## Fixed Bundle

Example:

Products:

Shirt

Jeans

Shoes

Condition:

All required products exist.

Action:

Apply bundle discount.

---

# Quantity Bundle

Example:

Buy 3 products

Condition:

Quantity >= required quantity.

Action:

Apply discount.

---

# Mix & Match Bundle

Example:

Choose any 3 products.

Condition:

Selected products match bundle rules.

Action:

Apply discount.

---

# Database Integration

Use:

Bundle table

BundleProduct table

Read:

- Bundle type
- Discount type
- Discount value
- Product relationships

---

# Security Requirements

Discount function must:

- Validate bundle ownership
- Prevent invalid discounts
- Prevent price manipulation
- Trust Shopify checkout data only

---

# Error Handling

Handle:

Bundle not found

Invalid cart

Missing products

Expired bundle

Inactive bundle

---

# Performance Requirements

Optimize:

- Function execution speed
- Database lookups
- Bundle matching logic

Avoid:

Heavy calculations during checkout.

---

# API Requirements

Required:

Backend service:

GET

/api/discount-rules/:bundleId

Purpose:

Provide discount configuration.

---

# Testing Requirements

## Percentage Discount Test

Input:

$100

20% discount

Expected:

$80

---

## Fixed Discount Test

Input:

$100

$25 discount

Expected:

$75

---

## Bundle Validation Test

Test:

Correct products

Wrong products

Missing products

---

## Checkout Test

Verify:

Discount appears correctly at checkout.

---

# Expected Output

After completing this phase:

✓ Shopify Discount Function created

✓ Automatic discounts working

✓ Percentage discount working

✓ Fixed discount working

✓ Bundle validation completed

✓ Checkout integration completed

---

# Files Expected To Create

Example:

extensions/

bundle-discount-function/

src/

index.ts

discount.ts

services/

discount/

calculateDiscount.ts

validateDiscount.ts

---

# Development Rules

During implementation:

1. Use Shopify Functions instead of custom checkout logic.

2. Never manipulate prices manually.

3. Keep discount logic reusable.

4. Support future discount types.

5. Follow Shopify checkout standards.

---

# Completion Report

After finishing this phase provide:

## Summary

Discount features implemented.

## Shopify Extension

Created functions.

## Discount Types

Supported types.

## Files Created

List files.

## Testing

Tests performed.

## Issues

Remaining tasks.
