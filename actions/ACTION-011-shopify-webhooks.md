# ACTION-011 — Shopify Webhooks

## Objective

Implement the Shopify webhook system required by BundleCraft so the application can reliably react to important Shopify store events.

The webhook system must be secure, multi-tenant, idempotent, observable, and production-ready.

---

# Required Documentation To Read First

Before writing any code, Claude Code MUST read:

1. `CLAUDE.md`
2. `docs/01-PRD.md`
3. `docs/02-ARCHITECTURE.md`
4. `docs/04-DATABASE_DESIGN.md`
5. `docs/05-SHOPIFY_INTEGRATION.md`
6. `docs/07-AUTHENTICATION.md`
7. `docs/13-SECURITY.md`
8. `tasks/phase-03-authentication/shopify-auth.md`
9. `tasks/phase-10-testing/testing-strategy.md`

Also inspect the implementation created by:

- `actions/ACTION-003-shopify-authentication.md`
- `actions/ACTION-010-testing.md`

Do NOT assume that previous implementation is perfect. Inspect the existing code before modifying it.

---

# Role

Act as a senior Shopify SaaS engineer responsible for implementing a secure production-grade webhook architecture for BundleCraft.

The implementation must follow the existing project architecture and documentation.

Do not introduce unrelated features.

---

# Scope

Implement the webhook infrastructure required for the current MVP and prepare the architecture for future Shopify webhook events.

The system should support:

- Webhook registration
- Webhook endpoint handling
- HMAC verification
- Shop identification
- Event validation
- Idempotent processing
- Database persistence where required
- Error handling
- Logging
- Retry-safe processing
- Uninstall handling
- Future webhook extensibility

---

# 1. Inspect Existing Shopify Integration

First inspect the current implementation.

Identify:

- Shopify OAuth implementation
- Stored shop information
- Access token handling
- Shopify API utilities
- Authentication middleware
- Database schema
- Existing API route structure
- Existing error handling
- Existing logging system

Reuse existing utilities whenever appropriate.

Do not create duplicate authentication or Shopify client implementations.

---

# 2. Webhook Architecture

Create a reusable webhook architecture.

Recommended structure:

```text
src/
├── app/
│   └── api/
│       └── webhooks/
│           └── shopify/
│               └── route.ts
│
├── lib/
│   └── shopify/
│       ├── webhooks.ts
│       ├── webhook-verification.ts
│       └── webhook-handler.ts
│
└── services/
    └── shopify/
        └── webhook-service.ts

Adapt the structure to the existing project structure if it differs.

Do not blindly create duplicate directories.

3. Webhook Endpoint

Create the Shopify webhook endpoint.

The endpoint must:

Receive Shopify webhook requests.
Read the raw request body.
Validate the Shopify webhook signature.
Read the relevant Shopify webhook headers.
Determine the event/topic.
Determine the originating shop.
Validate that the shop exists.
Dispatch the event to the correct handler.
Return the correct HTTP response.
Prevent duplicate processing.

The endpoint must not trust client-provided shop identifiers without verification.

4. HMAC Verification

Implement webhook HMAC verification.

Requirements:

Use the Shopify app secret configured through environment variables.
Verify the signature against the raw request body.
Use a timing-safe comparison.
Never log the app secret.
Never log access tokens.
Reject invalid webhook signatures.
Reject malformed requests.

The verification logic must be isolated into a reusable utility.

Example responsibility:

verifyShopifyWebhook(
  rawBody,
  signature,
  appSecret
)

Do not hardcode secrets.

5. Webhook Topics

Implement support for the MVP-relevant Shopify webhook events.

At minimum prepare handlers for:

APP_UNINSTALLED
PRODUCTS_UPDATE
PRODUCTS_CREATE
PRODUCTS_DELETE
ORDERS_CREATE

Use the Shopify webhook topic values appropriate for the current Shopify API implementation.

If the current project documentation does not specify an exact topic or API version, inspect the existing configuration before implementing.

Do not invent unsupported event behavior.

6. App Uninstall Webhook

Implement the uninstall flow.

When a merchant uninstalls BundleCraft:

Identify the correct shop.
Mark the shop as uninstalled/inactive.
Invalidate or remove the stored Shopify access credentials according to the existing security architecture.
Prevent further authenticated app operations for that shop.
Preserve necessary historical application data where appropriate.
Make the handler idempotent.

The uninstall handler must not accidentally delete unrelated merchant data.

Do not permanently delete all shop data unless explicitly required by the existing documentation.

7. Product Webhooks

Prepare product webhook handlers for:

PRODUCTS_CREATE
PRODUCTS_UPDATE
PRODUCTS_DELETE

These handlers should provide the foundation for keeping BundleCraft product information synchronized with Shopify.

For the MVP:

Validate the payload.
Identify the shop.
Process the event safely.
Update local product-related data only if such data exists in the current schema.
If complete product synchronization is not yet implemented, create a clean service boundary for ACTION-012.

Do NOT implement the complete product synchronization system in this action.

That work belongs to:

ACTION-012-product-sync.md
8. Order Webhook

Prepare the order webhook handler:

ORDERS_CREATE

The handler should:

Validate the shop.
Validate the webhook payload.
Identify the order.
Provide a service boundary for bundle purchase attribution.
Avoid blocking Shopify with long-running processing.

If the complete analytics purchase attribution system is not yet implemented, do not duplicate it here.

The handler should expose a clean integration point for the existing analytics architecture.

9. Idempotency

Webhook delivery can potentially be repeated.

Implement webhook idempotency.

Use Shopify's webhook event/request identifier when available from the webhook headers.

Create an appropriate persistence mechanism if the current database architecture supports it.

Possible structure:

WebhookEvent

Fields may include:

id
shopId
eventId
topic
processed
processedAt
createdAt
error

Before adding a new model:

Inspect docs/04-DATABASE_DESIGN.md
Inspect the existing Prisma schema.
Avoid unnecessary duplication.

The same webhook event must not be processed twice.

10. Webhook Processing

Separate webhook reception from business logic.

Recommended flow:

Shopify
   ↓
Webhook Endpoint
   ↓
HMAC Verification
   ↓
Shop Identification
   ↓
Idempotency Check
   ↓
Webhook Dispatcher
   ↓
Topic Handler
   ↓
Service Layer
   ↓
Database / Application Logic

Avoid putting large business logic directly inside the API route.

11. Response Handling

Webhook endpoints should respond quickly.

Do not perform unnecessarily expensive operations before returning the webhook response.

Where the project architecture allows it:

Receive
→ Validate
→ Register Event
→ Dispatch Processing
→ Return Response

Do not create a complex queue infrastructure unless it is actually required by the current application architecture.

12. Error Handling

Implement clear error handling for:

Missing signature
Invalid signature
Missing shop
Unknown shop
Unknown webhook topic
Invalid JSON
Invalid payload
Duplicate webhook
Database failure
Handler failure

Errors must not expose:

Access tokens
App secrets
Database credentials
Sensitive merchant information

Use the project's existing error-handling conventions.

13. Logging

Create structured webhook logs.

Useful fields:

topic
shopDomain
eventId
processingStatus
timestamp
errorCode

Never log:

accessToken
appSecret
clientSecret
databasePassword

Use the existing logging system if one already exists.

Do not create multiple unrelated logging systems.

14. Security Requirements

The implementation MUST:

Verify webhook HMAC.
Validate the webhook origin using Shopify's signed webhook mechanism.
Validate the shop.
Protect against replay/duplicate processing.
Avoid leaking secrets.
Use environment variables for secrets.
Follow existing multi-tenant isolation rules.
Validate webhook payloads.
Avoid trusting arbitrary request data.

Do not disable security checks for development convenience.

15. Webhook Registration

Create a reusable webhook registration service.

The service should provide a clear abstraction for registering required Shopify webhooks for an installed shop.

Example:

registerShopifyWebhooks(shop)

It should be possible to register the required topics without duplicating code.

Use the existing Shopify API integration.

Do not create a second OAuth/API client.

16. Environment Variables

Inspect the existing environment configuration.

If required, document webhook-related configuration in:

.env.example

Never place real credentials inside:

.env.example

or source code.

17. Testing

Create automated tests for:

HMAC
Valid signature
Invalid signature
Missing signature
Tampered payload
Webhook endpoint
Valid webhook
Invalid webhook
Unknown shop
Unknown topic
Invalid payload
Idempotency
First event processes successfully
Same event does not process twice
Uninstall
Shop becomes inactive/uninstalled
Credentials are handled securely
Repeated uninstall event is safe
Product events
Create event
Update event
Delete event
Order event
Valid order event
Invalid order event

Tests must not use production credentials.

18. Type Safety

Use TypeScript throughout the implementation.

Avoid:

any

unless there is a documented technical reason.

Create typed webhook payload boundaries where practical.

Validate external webhook payloads before using them internally.

19. Multi-Tenant Security

Every webhook operation must be associated with the correct Shopify shop.

Never allow:

Shop A webhook
→ Shop B data

Verify:

Shopify shop domain
        ↓
Shop record
        ↓
Shop-scoped processing

All database operations must maintain tenant isolation.

20. Documentation Updates

After implementation update relevant documentation if the actual implementation differs from the existing architecture.

Potential files:

docs/05-SHOPIFY_INTEGRATION.md
docs/07-AUTHENTICATION.md
docs/13-SECURITY.md
docs/14-TESTING_STRATEGY.md

Do not rewrite unrelated documentation.

Document:

Webhook endpoint
Supported topics
Verification mechanism
Idempotency strategy
Registration mechanism
Uninstall behavior
21. Validation Commands

Run the project's available validation commands.

At minimum attempt:

npm run lint
npm run typecheck
npm test
npm run build

If a command does not exist:

Do not invent it.
Report that it was unavailable.
Use the project's actual equivalent command.
22. Final Verification Checklist

Before marking this action complete, verify:

 Webhook endpoint exists
 Raw request body is handled correctly
 HMAC verification implemented
 Invalid signatures rejected
 Shop identification implemented
 Multi-tenant isolation maintained
 Idempotency implemented
 Webhook dispatcher implemented
 APP_UNINSTALLED handler implemented
 Product webhook handlers prepared
 Order webhook handler prepared
 Webhook registration service implemented
 Secrets are protected
 Structured logging implemented/reused
 Error handling implemented
 Tests created
 Lint passes or failures documented
 Typecheck passes or failures documented
 Tests pass or failures documented
 Build passes or failures documented
 Documentation updated where necessary
Important Restrictions

DO NOT implement:

Complete product synchronization
Advanced product catalog management
Advanced order analytics
New bundle features
New billing features
New dashboard features
AI features
Future roadmap features
Unrelated refactoring

Those belong to other actions/phases.

Keep this action focused on:

Shopify Webhooks Infrastructure.

Completion Report

When finished, provide a concise report containing:

1. Implementation Summary

What was implemented.

2. Files Created

List every new file.

3. Files Modified

List every modified file.

4. Database Changes

List any Prisma/schema/migration changes.

5. Webhook Topics

List the implemented topics.

6. Security

Explain HMAC verification, tenant isolation, and idempotency.

7. Tests

List tests created and their results.

8. Validation

Report:

Lint:
Typecheck:
Tests:
Build:

Use the actual results.

9. Issues

List unresolved issues honestly.

Do not claim successful Shopify production verification unless it was actually performed.

10. Next Action

After completing this action, the next planned action is:

ACTION-012-product-sync.md

Do not execute the next action automatically.
```
