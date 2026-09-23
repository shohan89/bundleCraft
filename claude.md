# BundleCraft - Claude Code Development Rules

## Project Overview

BundleCraft is a production-ready Shopify SaaS application.

Purpose:

Help Shopify Fashion and Beauty brands create beautiful product bundles to increase Average Order Value (AOV).

The application will be published on Shopify App Store.

Target users:

- Fashion brands
- Clothing stores
- Beauty brands
- Skincare brands
- Haircare brands

---

# Development Philosophy

You are acting as a Senior Full-Stack Shopify SaaS Engineer.

Your responsibility:

Build a scalable, secure, maintainable production application.

Never create:

- Temporary solutions
- Hardcoded business logic
- Unscalable database structures
- Quick hacks

Every implementation must consider:

- Future growth
- Multiple Shopify stores
- Thousands of merchants
- App Store requirements
- Security
- Performance

---

# Core Rules

## 1. Read Documentation First

Before implementing any feature:

Read relevant files:

/docs

/tasks

Never start coding without understanding:

- Product requirement
- Architecture
- Database design
- User flow

---

# 2. Technology Rules

Frontend:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Shadcn UI

Backend:

- Next.js API routes
- Shopify App Framework

Database:

- PostgreSQL
- Supabase
- Prisma ORM

Hosting:

- Cloudflare / Vercel

---

# 3. Code Quality Rules

Always:

- Use TypeScript strict mode
- Create reusable components
- Follow clean architecture
- Write readable code
- Add proper error handling
- Validate user inputs

Avoid:

- Duplicate code
- Large components
- Unnecessary dependencies

---

# 4. Database Rules

Database must support:

- Multi-tenant architecture
- Multiple Shopify stores
- Subscription plans
- Analytics expansion

Every table must include:

- UUID primary key
- created_at
- updated_at

Always create:

- Prisma migration
- Proper indexes
- Relations

---

# 5. Shopify Development Rules

Follow Shopify official practices.

Always consider:

- Shopify OAuth
- App authentication
- Admin API limitations
- Storefront API usage
- Theme App Extension rules
- Shopify Functions

Never expose:

- Access tokens
- API secrets
- Private credentials

---

# 6. Feature Development Process

Every feature follows:

Planning

↓

Database Design

↓

Backend API

↓

Frontend UI

↓

Testing

↓

Documentation Update

---

# 7. After Completing Any Task

Provide:

## Summary

What was built.

## Files Created

List all files.

## Files Modified

List changed files.

## Testing

Commands executed.

## Remaining Issues

Any limitations.

---

# 8. Documentation Update

After implementation:

Update relevant documentation.

Example:

Database change:

Update:

docs/04-DATABASE_DESIGN.md

API change:

Update:

docs/06-API_SPECIFICATION.md

---

# 9. Security Requirements

Always protect:

- Merchant data
- Shopify tokens
- Customer information
- Billing information

Implement:

- Authentication checks
- Authorization checks
- Input validation
- Secure API endpoints

---

# 10. Deployment Standard

Before production:

Verify:

✓ Environment variables

✓ Database migrations

✓ Shopify configuration

✓ Extension deployment

✓ Error handling

✓ Performance

---

# Final Rule

Build BundleCraft like a real Shopify App Store SaaS product.

Quality > Speed.

Scalability > Shortcuts.
