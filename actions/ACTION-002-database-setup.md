# ACTION-002

# BundleCraft Database Setup

## Objective

Implement the production-ready database architecture for BundleCraft.

This action creates the complete database foundation required for the Shopify SaaS application.

The implementation must follow the approved database architecture.

---

# Required Documentation To Read First

Before execution, read:

CLAUDE.md

docs/02-ARCHITECTURE.md

docs/04-DATABASE_DESIGN.md

tasks/phase-02-database/database-implementation.md

Understand database requirements before writing code.

---

# Role

Act as a Senior Database Engineer and Backend Architect.

Follow all rules from CLAUDE.md.

---

# Implementation Tasks

## 1. Install Prisma

Setup Prisma ORM.

Requirements:

- Install Prisma packages
- Initialize Prisma
- Configure PostgreSQL provider

---

# 2. Configure Supabase PostgreSQL

Prepare database connection.

Create:

.env.example

Required:

DATABASE_URL=

Rules:

- Never add real credentials
- Never expose database URL

---

# 3. Create Prisma Schema

Implement production database models.

Required models:

## User

Purpose:

Store application users.

Fields:

- id
- email
- name
- createdAt
- updatedAt

---

## Shop

Purpose:

Store Shopify merchant information.

Fields:

- id
- shopDomain
- accessToken
- email
- plan
- status
- installedAt
- createdAt
- updatedAt

---

## Bundle

Purpose:

Store merchant bundles.

Fields:

- id
- shopId
- title
- description
- bundleType
- discountType
- discountValue
- status
- createdAt
- updatedAt

---

## BundleProduct

Purpose:

Connect Shopify products with bundles.

Fields:

- id
- bundleId
- shopifyProductId
- shopifyVariantId
- quantity
- position
- createdAt

---

## Template

Purpose:

Store bundle templates.

Fields:

- id
- name
- category
- configurationJson
- createdAt

---

## Customization

Purpose:

Store widget customization settings.

Fields:

- id
- bundleId
- primaryColor
- buttonColor
- backgroundColor
- layout
- fontSize
- createdAt
- updatedAt

---

## AnalyticsEvent

Purpose:

Store bundle analytics events.

Fields:

- id
- shopId
- bundleId
- eventType
- revenue
- metadataJson
- createdAt

---

## Subscription

Purpose:

Store Shopify billing information.

Fields:

- id
- shopId
- shopifyChargeId
- plan
- status
- startedAt
- cancelledAt

---

# 4. Create Database Relations

Implement:

Shop

has many:

- Bundles
- Analytics Events

has one:

- Subscription

Bundle

has many:

- Bundle Products

has one:

- Customization

---

# 5. Create Database Indexes

Add indexes for:

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

Improve performance when application grows.

---

# 6. Create Prisma Client

Create reusable Prisma client.

Requirements:

- Avoid multiple database connections in development
- Production compatible

Expected location:

lib/prisma.ts

---

# 7. Create Database Migration

Generate initial migration.

Verify:

- Tables created
- Relations working
- Constraints applied

---

# 8. Create Seed Data

Create development seed system.

Add sample data:

Templates:

Fashion:

- Complete Look
- Weekend Outfit
- Seasonal Collection

Beauty:

- Skincare Routine
- Hair Care Kit

---

# Validation Checklist

Verify:

✓ Prisma installed

✓ Database connected

✓ Schema valid

✓ Migration successful

✓ Prisma client generated

✓ Seed runs successfully

✓ Relations working

---

# Files Expected To Create

prisma/

schema.prisma

seed.ts

lib/

prisma.ts

---

# Important Rules

During execution:

1. Do not create API routes yet.

2. Do not create authentication yet.

3. Do not add temporary database models.

4. Follow scalable SaaS architecture.

5. Keep schema future-ready.

---

# Completion Report

After finishing provide:

## Summary

Database implementation summary.

## Models Created

List Prisma models.

## Migration

Migration details.

## Files Created

List files.

## Commands Executed

Terminal commands.

## Testing

Database tests performed.

## Issues

Remaining database tasks.
