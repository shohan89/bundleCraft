# Phase 03 - Shopify Authentication Implementation

## Objective

Implement a secure Shopify authentication system for BundleCraft.

The goal of this phase is to allow Shopify merchants to:

- Install the app
- Approve permissions
- Authenticate securely
- Access merchant dashboard
- Maintain secure sessions

---

# Authentication Requirements

The authentication system must support:

- Shopify OAuth 2.0
- Session management
- Access token storage
- Protected application routes
- Merchant isolation
- Authentication middleware

---

# Technology Requirements

Use:

Authentication:

Shopify App Authentication

Backend:

Next.js API Routes

Database:

PostgreSQL + Prisma

Security:

Encrypted credentials storage

---

# Authentication Flow

Implement the following flow:

Merchant installs BundleCraft

↓

Shopify redirects to OAuth authorization

↓

Merchant approves permissions

↓

Shopify returns authorization code

↓

Backend exchanges code for access token

↓

Store merchant information

↓

Create authenticated session

↓

Redirect merchant to dashboard

---

# Shopify OAuth Implementation

## OAuth Start Route

Create authentication endpoint:

Example:

/api/auth/shopify

Responsibilities:

- Receive shop domain
- Validate Shopify store
- Generate OAuth URL
- Redirect merchant

---

# OAuth Callback Route

Create callback endpoint:

Example:

/api/auth/callback

Responsibilities:

1. Receive authorization code

2. Verify request authenticity

3. Exchange code for access token

4. Save shop information

5. Create session

6. Redirect dashboard

---

# Required Shopify Permissions

Configure required scopes:

Products:

read_products

Orders:

read_orders

Themes:

write_themes

Future:

customers

---

# Shop Database Integration

After successful authentication:

Create or update Shop record.

Store:

- shop_domain

- encrypted_access_token

- email

- plan

- status

- installed_at

---

# Access Token Security

Shopify access tokens are sensitive.

Rules:

Never:

- Expose token to frontend
- Store in browser storage
- Log token
- Return token through API

Must:

- Encrypt before storing
- Access only from backend
- Use secure environment configuration

---

# Session Management

Implement secure sessions.

Session must contain:

- User identity
- Shop identity
- Session expiry
- Authentication state

---

# Authentication Middleware

Create reusable middleware.

Purpose:

Protect private routes.

Example flow:

Request

↓

Authentication Middleware

↓

Validate Session

↓

Attach Shop Context

↓

Allow Request

---

# Protected Routes

Protect:

Dashboard:

/dashboard

Bundle APIs:

/api/bundles

Analytics:

/api/analytics

Settings:

/api/settings

---

# Merchant Data Isolation

Every authenticated request must know:

Current shop_id

Database queries must always include:

shop_id filtering

Example:

Allowed:

Find bundles where:

shopId = authenticatedShop

Not allowed:

Fetch all bundles

---

# Uninstall Handling

Prepare uninstall handling.

When merchant removes app:

Shopify sends uninstall webhook.

System should:

1. Mark shop status inactive

2. Remove active sessions

3. Handle merchant data according to retention policy

---

# Authentication Error Handling

Handle:

Invalid shop domain

Expired session

Invalid OAuth response

Missing permissions

Unauthorized access

Return:

Proper error message

Safe response

---

# Security Requirements

Implement:

✓ OAuth validation

✓ Session verification

✓ CSRF protection

✓ Secure token handling

✓ API authorization

✓ Shop data isolation

---

# Expected Output

After completing this phase:

✓ Shopify OAuth works

✓ Merchant can install app

✓ Shop data saved

✓ Sessions working

✓ Protected routes enabled

✓ Authentication middleware created

✓ Security rules implemented

---

# Files Expected To Create

Example structure:

app/

api/

auth/

shopify/

callback/

middleware.ts

lib/

auth/

shopify-auth.ts

session.ts

services/

shopify/

oauth.ts

---

# Testing Requirements

Test:

## Installation Test

✓ Install app on development store

## OAuth Test

✓ Authorization completes

## Database Test

✓ Shop record created

## Security Test

✓ Unauthorized users blocked

## Session Test

✓ Dashboard access works

---

# Development Rules

During implementation:

1. Follow Shopify recommended authentication practices.

2. Never create custom insecure authentication.

3. Never expose private credentials.

4. Keep authentication logic reusable.

5. Update documentation after completion.

---

# Completion Report

After finishing this phase provide:

## Summary

What authentication features were implemented.

## OAuth Flow

Explain completed flow.

## Files Created

List files.

## Security Measures

List security implementations.

## Testing

Commands and tests executed.

## Issues

Any remaining tasks.
