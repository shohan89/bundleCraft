# Phase 09 - Billing System Implementation

## Objective

Implement a production-ready Shopify subscription billing system for BundleCraft.

The billing system will manage:

- Merchant subscriptions
- Pricing plans
- Feature access
- Subscription status
- Billing lifecycle

---

# Billing Technology

Use:

Shopify Billing API

Purpose:

Create and manage Shopify app subscriptions.

Database:

PostgreSQL

ORM:

Prisma

---

# Pricing Plans

BundleCraft supports:

## Free Plan

Price:

$0/month

Features:

- 1 active bundle
- Basic widget
- Shopify branding

---

## Starter Plan

Price:

$19/month

Features:

- Unlimited bundles
- Templates
- Customization

---

## Growth Plan

Price:

$39/month

Features:

- Analytics
- Remove branding

---

## Pro Plan

Price:

$79/month

Features:

- Multiple stores
- Advanced reports

---

# Billing Architecture

Merchant

|

Select Plan

|

Shopify Billing API

|

Subscription Approval

|

Webhook Confirmation

|

Update Database

|

Enable Features

---

# Subscription Flow

Merchant opens billing page

↓

Selects subscription plan

↓

Backend creates Shopify subscription

↓

Shopify confirmation page opens

↓

Merchant approves payment

↓

Shopify sends confirmation

↓

Update subscription status

↓

Unlock features

---

# Shopify Billing Integration

Implement:

## Create Subscription

Purpose:

Create recurring Shopify app charge.

Example:

POST subscription request

---

## Subscription Confirmation

After approval:

Save:

- Charge ID
- Plan
- Status
- Start date

---

# Database Integration

Use Subscription model:

Fields:

id

shop_id

shopify_charge_id

plan

status

started_at

cancelled_at

---

# Subscription Status

Support:

## Active

Merchant has paid subscription.

---

## Pending

Subscription waiting for approval.

---

## Cancelled

Merchant cancelled subscription.

---

## Expired

Subscription no longer active.

---

# Billing Service Layer

Create:

services/

billing/

createSubscription.ts

getSubscription.ts

cancelSubscription.ts

checkPlanAccess.ts

---

# Billing API Endpoints

## Create Subscription

POST

/api/billing/create

Purpose:

Create Shopify subscription.

---

## Get Current Plan

GET

/api/billing/current

Purpose:

Return merchant subscription.

---

## Cancel Subscription

POST

/api/billing/cancel

Purpose:

Cancel subscription.

---

# Feature Access Control

Create middleware/service:

Purpose:

Check merchant plan before allowing features.

Example:

Free plan:

Allowed:

1 active bundle

Blocked:

Advanced analytics

---

Starter:

Allowed:

Unlimited bundles

Blocked:

Advanced reports

---

# Plan Limit System

Create configuration:

Example:

plans/

free:

bundleLimit:1

analytics:false

starter:

bundleLimit:null

analytics:false

growth:

bundleLimit:null

analytics:true

---

# Billing Webhooks

Handle Shopify events:

## App Subscription Update

Purpose:

Detect subscription changes.

---

## App Uninstalled

Purpose:

Handle merchant removal.

---

# Security Requirements

Billing system must:

- Verify Shopify billing responses
- Protect subscription data
- Validate shop ownership
- Prevent unauthorized feature access

---

# Error Handling

Handle:

Payment failure

Subscription rejected

Invalid plan

Expired subscription

Shopify API failure

---

# Expected Output

After completing this phase:

✓ Shopify Billing API connected

✓ Subscription creation working

✓ Pricing plans implemented

✓ Plan access control working

✓ Billing status tracking completed

✓ Webhooks configured

---

# Files Expected To Create

Example:

services/

billing/

createSubscription.ts

checkPlanAccess.ts

getSubscription.ts

app/

api/

billing/

create/

route.ts

current/

route.ts

cancel/

route.ts

---

# Testing Requirements

Test:

## Free Plan

✓ Feature limits applied

## Paid Plan

✓ Subscription created

## Approval Flow

✓ Billing approval works

## Cancellation

✓ Subscription status updates

## Access Control

✓ Restricted features blocked

---

# Development Rules

During implementation:

1. Use Shopify Billing API only.

2. Never create custom payment systems.

3. Keep plan rules configurable.

4. Separate billing logic from UI.

5. Prepare for future pricing changes.

---

# Completion Report

After finishing this phase provide:

## Summary

Billing features implemented.

## Plans Created

List plans.

## APIs Created

List endpoints.

## Webhooks Created

List webhooks.

## Testing

Tests performed.

## Issues

Remaining tasks.
