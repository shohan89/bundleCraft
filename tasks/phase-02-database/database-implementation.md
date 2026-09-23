# Phase 02 - Database Implementation

## Objective

Implement a production-ready database architecture for BundleCraft.

The database must support:

- Multiple Shopify stores
- Merchant data isolation
- Bundle management
- Product relationships
- Analytics tracking
- Subscription billing
- Future scalability

---

# Database Technology

Use:

Database:

PostgreSQL

Hosting:

Supabase

ORM:

Prisma

---

# Database Architecture Principles

The database must follow:

- Multi-tenant SaaS architecture
- Secure merchant isolation
- Normalized relational design
- Scalable indexing
- Future feature compatibility

---

# Database Entities

Create the following models:

1. User

2. Shop

3. Bundle

4. BundleProduct

5. Template

6. Customization

7. AnalyticsEvent

8. Subscription

---

# Prisma Setup

Tasks:

1. Install Prisma

2. Initialize Prisma

3. Configure PostgreSQL connection

4. Create schema.prisma

5. Generate Prisma client

---

# Database Schema Requirements

## User Model

Purpose:

Store application users.

Fields:

id

UUID primary key

email

String

name

String nullable

createdAt

DateTime

updatedAt

DateTime

---

## Shop Model

Purpose:

Store Shopify merchant information.

Fields:

id

UUID primary key

shopDomain

Unique Shopify domain

accessToken

Encrypted Shopify access token

email

plan

free

starter

growth

pro

status

active

inactive

installedAt

createdAt

updatedAt

Relations:

One Shop:

- Many Bundles

- Many Analytics Events

- One Subscription

---

# Bundle Model

Purpose:

Store merchant created bundles.

Fields:

id

shopId

title

description

bundleType

fixed

quantity

mix_match

discountType

percentage

fixed_amount

discountValue

status

draft

active

inactive

createdAt

updatedAt

Relations:

Bundle belongs to Shop

Bundle has many BundleProducts

Bundle has one Customization

---

# BundleProduct Model

Purpose:

Connect Shopify products with bundles.

Fields:

id

bundleId

shopifyProductId

shopifyVariantId

quantity

position

createdAt

---

# Template Model

Purpose:

Store predefined bundle templates.

Fields:

id

name

category

fashion

beauty

configurationJson

createdAt

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

# Customization Model

Purpose:

Store storefront widget design settings.

Fields:

id

bundleId

primaryColor

buttonColor

backgroundColor

layout

card

horizontal

vertical

fontSize

createdAt

updatedAt

---

# AnalyticsEvent Model

Purpose:

Track bundle performance.

Fields:

id

shopId

bundleId

eventType

bundle_view

bundle_add

bundle_purchase

revenue

metadataJson

createdAt

---

# Subscription Model

Purpose:

Store Shopify billing information.

Fields:

id

shopId

shopifyChargeId

plan

status

active

cancelled

startedAt

cancelledAt

---

# Database Relations

Implement:

Shop

|

|--- Bundles

|

|--- Analytics Events

|

|--- Subscription

Bundle

|

|--- Bundle Products

|

|--- Customization

---

# Index Requirements

Create indexes for:

Shop:

shopDomain

Bundle:

shopId

status

Analytics:

shopId

bundleId

createdAt

Purpose:

Improve query performance as data grows.

---

# Security Requirements

Important:

Every merchant related table must support shop isolation.

Every query must filter by:

shopId

Example:

Correct:

Get bundles WHERE shopId=currentShop

Incorrect:

Get all bundles

---

# Migration Setup

Create:

Initial migration

Verify:

Database tables created successfully.

---

# Seed Data

Create development seed data:

Include:

Example shop

Example templates:

Fashion:

- Complete Look

- Weekend Outfit

Beauty:

- Skincare Routine

- Hair Care Kit

---

# Prisma Client Setup

Create reusable Prisma client instance.

Requirements:

- Prevent multiple connections during development
- Support production deployment

---

# Database Validation

Test:

✓ Connection successful

✓ Migration successful

✓ Prisma client generated

✓ Seed data inserted

✓ Relations working

---

# Expected Output

After completing this phase:

✓ PostgreSQL connected

✓ Supabase configured

✓ Prisma installed

✓ Database schema completed

✓ Migration completed

✓ Seed system created

✓ Database architecture documented

---

# Files Expected To Create

prisma/

schema.prisma

seed.ts

lib/

prisma.ts

---

# Development Rules

During implementation:

1. Do not create incomplete schema.

2. Do not remove future scalability options.

3. Follow Prisma best practices.

4. Use proper relations.

5. Add comments where business logic is complex.

---

# Completion Report

After finishing this phase provide:

## Summary

What database features were implemented.

## Database Models Created

List all models.

## Migration Details

List migrations created.

## Files Created

List new files.

## Testing

Commands executed.

## Issues

Any remaining database tasks.
