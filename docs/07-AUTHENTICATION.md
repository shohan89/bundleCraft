# BundleCraft Authentication Architecture

## Purpose

Design a secure authentication system for Shopify merchants.

The system must allow:

- Shopify app installation
- Merchant authorization
- Secure sessions
- Store isolation
- Permission validation

---

# Authentication Technology

BundleCraft uses Shopify recommended authentication flow.

Components:

- Shopify OAuth 2.0
- Shopify App Bridge
- Shopify Session Management
- Prisma Database

---

# Authentication Flow Overview

Merchant opens Shopify App

        ↓

Shopify OAuth Authorization

        ↓

Merchant approves permissions

        ↓

Shopify returns authorization code

        ↓

Backend exchanges code for access token

        ↓

Store information saved in database

        ↓

Create authenticated session

        ↓

Merchant Dashboard access

---

# Shopify OAuth Flow

## Step 1: App Installation

Merchant installs BundleCraft from Shopify App Store.

Shopify sends:

- shop domain
- installation request

Example:

store-name.myshopify.com

---

# Step 2: Authorization Redirect

Backend redirects merchant to Shopify OAuth page.

Shopify requests permission for:

- Products
- Orders
- Themes
- Other required scopes

---

# Step 3: Permission Approval

Merchant approves requested permissions.

Shopify returns:

Authorization code

---

# Step 4: Access Token Exchange

Backend exchanges authorization code.

Input:

- Client ID
- Client Secret
- Authorization code

Output:

Permanent Shopify access token

---

# Step 5: Store Merchant Data

Save:

Shop Table

Fields:

id

shop_domain

access_token

email

plan

status

installed_at

created_at

updated_at

---

# Session Management

## Purpose

Maintain secure merchant login state.

Session stores:

- Shop identity
- User identity
- Session expiry
- Permissions

---

# Session Rules

Every dashboard request must verify:

1. Valid session

2. Connected Shopify shop

3. User authorization

---

# Merchant Isolation

BundleCraft is a multi-tenant SaaS application.

Each Shopify store has isolated data.

Example:

Shop A

shop_id = 001

Can access:

- Own bundles
- Own analytics
- Own settings

Cannot access:

Shop B data

---

# Authorization Layer

Before any database operation:

Check:

Current User

        ↓

Current Shop

        ↓

Requested Resource

        ↓

Permission Validation

---

# API Authentication Rules

Every protected API must:

1. Verify Shopify session

2. Identify shop_id

3. Validate ownership

4. Execute request

---

# Access Token Security

Shopify access tokens are sensitive.

Rules:

Never:

- Send token to frontend
- Store token in client storage
- Log token

Always:

- Encrypt token
- Store server-side only
- Use environment secrets

---

# Database Security

All merchant-related tables must contain:

shop_id

Example:

Bundles table:

id

shop_id

title

Every query:

Correct:

SELECT bundles

WHERE shop_id = current_shop

Wrong:

SELECT all bundles

---

# Authentication Middleware

Create reusable middleware:

Responsibilities:

- Check authentication
- Validate session
- Attach shop context
- Handle unauthorized requests

Example:

Request

↓

Auth Middleware

↓

Shop Context

↓

API Handler

---

# Authentication States

## Installed

Merchant installed app successfully.

## Active Session

Merchant can access dashboard.

## Uninstalled

Shop removed app.

## Subscription Expired

Access limited based on plan.

---

# Uninstall Handling

When merchant removes app:

Shopify sends uninstall webhook.

System should:

1. Mark shop inactive

2. Remove active sessions

3. Keep data according to retention policy

---

# Future Authentication Support

Architecture should allow:

## Team Members

Multiple users per store.

## Staff Permissions

Different access levels.

## Agency Accounts

Manage multiple Shopify stores.

---

# Security Checklist

✓ Shopify OAuth implemented

✓ Sessions secured

✓ Access tokens encrypted

✓ Merchant isolation enforced

✓ API authentication enabled

✓ Permission validation added

✓ Uninstall webhook handled

✓ No sensitive data exposed
