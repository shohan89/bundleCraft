# BundleCraft Database Design

## Database Objective

Design a scalable multi-tenant SaaS database architecture for Shopify merchants.

Database Technology:

- PostgreSQL
- Supabase
- Prisma ORM

The database must support:

- Multiple Shopify stores
- Subscription plans
- Bundle management
- Analytics tracking
- Future expansion

# Database Architecture

## Core Entities

User

Shop

Bundle

BundleProduct

Template

AnalyticsEvent

Subscription

Customization

---

# Entity Relationship

User

|

Shop

|

| | |

Bundle Analytics Subscription

|

BundleProduct

---

# Tables

# 1. Users Table

Purpose:

Store application users.

Table:

users

Fields:

id

UUID Primary Key

email

String

name

String

created_at

Timestamp

updated_at

Timestamp

---

# 2. Shops Table

Purpose:

Store Shopify merchant information.

Table:

shops

Fields:

id

UUID Primary Key

shop_domain

Unique Shopify domain

access_token

Encrypted Shopify token

email

plan

free

starter

growth

pro

status

active

inactive

installed_at

created_at

updated_at

Relations:

One Shop can have:

- Many Bundles
- Many Analytics Events
- One Subscription

---

# 3. Bundles Table

Purpose:

Store merchant created bundles.

Fields:

id

shop_id

title

description

bundle_type

fixed

quantity

mix_match

discount_type

percentage

fixed_amount

discount_value

status

draft

active

inactive

created_at

updated_at

---

# 4. Bundle Products Table

Purpose:

Connect Shopify products with bundles.

Fields:

id

bundle_id

shopify_product_id

shopify_variant_id

quantity

position

created_at

Example:

Bundle:

Summer Outfit

Products:

Shirt

Jeans

Cap

---

# 5. Templates Table

Purpose:

Store predefined bundle templates.

Fields:

id

name

category

fashion

beauty

configuration_json

created_at

Example:

Complete Look Template:

{
sections:[
"top",
"bottom",
"accessory"
]
}

---

# 6. Customizations Table

Purpose:

Store widget appearance settings.

Fields:

id

bundle_id

primary_color

button_color

background_color

layout

card

horizontal

vertical

font_size

created_at

---

# 7. Analytics Events Table

Purpose:

Track bundle performance.

Fields:

id

shop_id

bundle_id

event_type

view

add_to_cart

purchase

revenue

metadata_json

created_at

---

# 8. Subscription Table

Purpose:

Manage Shopify billing.

Fields:

id

shop_id

shopify_charge_id

plan

status

active

cancelled

started_at

cancelled_at

---

# Index Strategy

Important indexes:

shops.shop_domain

bundles.shop_id

analytics.bundle_id

analytics.created_at

Purpose:

Improve query performance when data grows.

---

# Security Rules

Never expose:

- Shopify access tokens
- Internal database IDs
- Merchant private data

Use:

- UUID IDs
- Encrypted credentials
- Role based access

---

# Future Expansion

Database should support:

- AI recommendations
- Gift bundles
- Subscription bundles
- Multi currency
- B2B pricing
- Advanced analytics
