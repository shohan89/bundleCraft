# Bundle Engine Architecture

## Purpose

Core business logic responsible for creating and managing bundles.

---

# Supported Bundle Types

## Fixed Bundle

Example:

Shirt + Jeans + Shoes

Bundle price:

$99

Logic:

Products are fixed.

Customer buys complete bundle.

---

# Quantity Bundle

Example:

Buy 3 T-Shirts

Get 15% discount

Logic:

Customer selects quantity.

---

# Mix & Match Bundle

Example:

Choose any 3 products

Get 20% discount

Logic:

Customer has product selection freedom.

---

# Bundle Creation Flow

Merchant creates bundle

↓

Select bundle type

↓

Select products

↓

Configure discount

↓

Customize appearance

↓

Publish

---

# Bundle Validation

Before publishing:

Check:

✓ Products exist

✓ Variants available

✓ Discount valid

✓ Bundle has products

---

# Discount Calculation

Input:

Products price

-

Discount rules

Output:

Final bundle price

---

# Business Rules

Bundle must belong to one Shopify store.

One store cannot access another store bundles.

---

# Future Expansion

Support:

- BOGO
- Subscription bundles
- Gift bundles
- Volume discounts
