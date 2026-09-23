# BundleCraft System Architecture

## Architecture Goal

Build a scalable multi-tenant Shopify SaaS platform.

The system must support:

- Thousands of Shopify merchants
- Subscription plans
- Large analytics data
- Future feature expansion

---

# High Level Architecture

Shopify Store

        |

        |

Shopify Extensions

        |

        |

BundleCraft Application

        |

---

Frontend Backend API

Next.js Node.js

React Shopify APIs

        |

        |

Prisma ORM

        |

        |

PostgreSQL

Supabase

---

# Application Layers

## Presentation Layer

Technology:

- Next.js
- React
- Tailwind

Responsibilities:

- Merchant dashboard
- Bundle builder UI
- Analytics UI

---

# Application Layer

Responsibilities:

- Business logic
- Bundle calculation
- Discount rules
- Validation

---

# Integration Layer

Handles:

Shopify:

- Admin API
- Storefront API
- Shopify Functions
- Theme Extensions

---

# Data Layer

Technology:

- PostgreSQL
- Prisma

Responsibilities:

- Store data
- Bundle data
- Analytics
- Billing

---

# Multi Tenant Architecture

Every merchant is separated by:

shop_id

Example:

Shop A

↓

Bundles

Shop B

↓

Bundles

No merchant can access another merchant data.

---

# Core Modules

## Merchant Dashboard

Routes:

/dashboard

Features:

- Overview
- Bundle management
- Analytics
- Settings

---

## Bundle Engine

Responsible:

- Bundle creation
- Product selection
- Discount calculation

---

## Storefront Widget

Responsible:

- Display bundles
- Add bundle to cart
- Customer interaction

---

## Analytics Engine

Tracks:

- Views
- Adds
- Purchases
- Revenue

---

## Billing System

Handles:

- Shopify subscriptions
- Plan limits
- Feature access
