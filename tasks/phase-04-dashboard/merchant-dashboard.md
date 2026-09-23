# Phase 04 - Merchant Dashboard Implementation

## Objective

Build a premium Shopify embedded merchant dashboard for BundleCraft.

The dashboard should provide Shopify merchants with a simple interface to:

- View business performance
- Create bundles
- Manage existing bundles
- Configure settings
- Monitor analytics

---

# Dashboard Requirements

The dashboard must be:

- Shopify embedded app compatible
- Mobile responsive
- Premium SaaS quality
- Beginner friendly
- Scalable for future features

---

# Technology Requirements

Frontend:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Shadcn UI

Shopify:

- Shopify App Bridge
- Embedded App Navigation

---

# Dashboard Architecture

Create dashboard route:

/dashboard

Main structure:

Dashboard Layout

|

├── Sidebar Navigation

|

├── Header

|

└── Page Content

---

# Navigation Structure

Create sidebar:

## Home

Route:

/dashboard

Purpose:

Overview of store performance.

---

## Bundles

Route:

/dashboard/bundles

Purpose:

Manage created bundles.

Features:

- View bundles
- Search bundles
- Filter bundles
- Edit bundles
- Duplicate bundles
- Delete bundles

---

## Create Bundle

Route:

/dashboard/bundles/create

Purpose:

Create new bundle through wizard.

---

## Analytics

Route:

/dashboard/analytics

Purpose:

View bundle performance.

---

## Settings

Route:

/dashboard/settings

Purpose:

Manage application settings.

---

# Home Dashboard

Create overview dashboard.

Display:

## Revenue Card

Shows:

Bundle generated revenue.

---

## Active Bundles Card

Shows:

Number of published bundles.

---

## Orders Card

Shows:

Bundle purchases.

---

## Conversion Card

Shows:

Bundle conversion rate.

---

# Recent Activity Section

Display:

- Recently created bundles
- Recent purchases
- Recent events

---

# Bundle Management Page

Route:

/dashboard/bundles

Create bundle table.

Columns:

Bundle Name

Type

Status

Revenue

Created Date

Actions

---

# Bundle Actions

Support:

## Edit

Update bundle information.

## Duplicate

Create copy of existing bundle.

## Delete

Remove bundle.

## Publish

Activate storefront widget.

---

# Create Bundle Wizard

Create multi-step form.

Flow:

Step 1:

Choose Template

Step 2:

Select Products

Step 3:

Configure Discount

Step 4:

Customize Design

Step 5:

Review & Publish

---

# Step 1 - Template Selection

Display templates:

Fashion:

- Complete Look
- Weekend Outfit
- Seasonal Collection

Beauty:

- Skincare Routine
- Hair Care Kit

---

# Step 2 - Product Selection

Features:

- Search Shopify products
- Select products
- Select variants
- Set quantities

---

# Step 3 - Discount Configuration

Support:

Percentage discount

Example:

20% OFF

Fixed amount discount

Example:

Save $30

---

# Step 4 - Customization

Merchant can configure:

Colors:

- Primary color
- Button color
- Background

Layout:

- Card
- Horizontal
- Vertical

Typography:

- Font size

---

# Step 5 - Review & Publish

Show:

Bundle preview

Products

Discount

Widget preview

Actions:

Save Draft

Publish Bundle

---

# Settings Page

Create settings structure.

Sections:

## Store Settings

- Store information
- Widget preferences

## Billing

Subscription information.

## Support

Help resources.

---

# Component Architecture

Create reusable components.

Example:

components/

dashboard/

Sidebar.tsx

Header.tsx

MetricCard.tsx

DataTable.tsx

BundleCard.tsx

Wizard.tsx

---

# State Management

Use scalable approach.

Recommended:

React Server Components

-

Server Actions/API routes

Avoid unnecessary global state.

---

# API Integration

Dashboard should connect with backend APIs.

Required APIs:

GET

/api/bundles

POST

/api/bundles

PUT

/api/bundles/:id

DELETE

/api/bundles/:id

---

# UI Requirements

Design principles:

- Clean
- Premium
- Simple
- Fast

Target users:

Non-technical Shopify merchants.

---

# Error Handling

Handle:

- API failures
- Loading states
- Empty states
- Permission errors

---

# Performance Requirements

Optimize:

- Component rendering
- Data fetching
- Image loading
- Bundle list performance

---

# Expected Output

After completing this phase:

✓ Shopify embedded dashboard created

✓ Navigation working

✓ Home page completed

✓ Bundle management UI created

✓ Create bundle wizard UI created

✓ Settings structure created

✓ Reusable components created

---

# Files Expected To Create

Example:

app/

dashboard/

page.tsx

bundles/

page.tsx

create/

page.tsx

analytics/

page.tsx

settings/

page.tsx

components/

dashboard/

Sidebar.tsx

Header.tsx

MetricCard.tsx

BundleTable.tsx

BundleWizard.tsx

---

# Testing Requirements

Test:

✓ Dashboard loads after authentication

✓ Navigation works

✓ Bundle pages accessible

✓ Wizard steps work

✓ Responsive layout works

---

# Development Rules

During implementation:

1. Follow Shopify embedded app guidelines.

2. Create reusable components.

3. Do not mix business logic with UI.

4. Keep API calls separated.

5. Maintain premium SaaS quality.

---

# Completion Report

After finishing this phase provide:

## Summary

What dashboard features were built.

## Pages Created

List routes.

## Components Created

List components.

## API Connected

List APIs.

## Testing

Tests performed.

## Issues

Remaining tasks.
