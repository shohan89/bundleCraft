# BundleCraft Security Architecture

## Security Goals

Protect:

- Merchant data
- Shopify credentials
- Customer information

---

# Authentication Security

Implement:

- Shopify OAuth
- Session validation
- Permission checks

---

# Database Security

Rules:

Every query must filter by shop_id.

Example:

Wrong:

Get all bundles

Correct:

Get bundles where shop_id=current_shop

---

# Token Security

Shopify access tokens:

Never expose

Store encrypted

Never send to frontend

---

# API Security

Every API endpoint:

Must verify:

1. User session

2. Shopify shop

3. Permission

---

# Input Security

Validate:

- Product IDs
- Discount values
- User inputs

---

# Production Security

Enable:

- HTTPS
- Environment variables
- Error monitoring
- Rate limiting
