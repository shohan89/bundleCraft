# ACTION-018 — Error Monitoring and Logging

## Objective

Implement a production-ready error monitoring and structured logging system for BundleCraft.

The system must help the development/operations team identify:

- Application errors
- API failures
- Shopify integration failures
- Webhook failures
- Database failures
- Product synchronization failures
- Bundle processing failures
- Billing failures
- Analytics failures
- Authentication failures

The logging and monitoring system must be secure and must never expose secrets or sensitive merchant information.

Do not introduce unrelated application features.

---

# Required Documentation To Read First

Before writing any code, Claude Code MUST read:

1. `CLAUDE.md`
2. `docs/01-PRD.md`
3. `docs/02-ARCHITECTURE.md`
4. `docs/05-SHOPIFY_INTEGRATION.md`
5. `docs/06-API_SPECIFICATION.md`
6. `docs/07-AUTHENTICATION.md`
7. `docs/11-ANALYTICS_SYSTEM.md`
8. `docs/12-BILLING_SYSTEM.md`
9. `docs/13-SECURITY.md`
10. `docs/14-TESTING_STRATEGY.md`

Also inspect:

```text
actions/ACTION-003-shopify-authentication.md
actions/ACTION-007-discount-function.md
actions/ACTION-008-analytics-system.md
actions/ACTION-009-billing-system.md
actions/ACTION-011-shopify-webhooks.md
actions/ACTION-012-product-sync.md
actions/ACTION-016-performance-optimization.md
actions/ACTION-017-security-hardening.md

Read the actual implementation before making changes.

Do not assume previous logging or error handling was implemented exactly as planned.

Role

Act as a senior production reliability engineer responsible for implementing a secure observability foundation for BundleCraft.

The system should make it possible to answer:

What failed?
Where did it fail?
Which shop was affected?
Which operation failed?
When did it fail?
What was the error category?
Can the operation be safely retried?

Do not log sensitive information merely because it is useful for debugging.

Scope

Implement or improve:

Structured application logging
Error classification
Centralized error handling
API error logging
Shopify API error logging
Webhook error logging
Database error logging
Product sync error logging
Bundle engine error logging
Billing error logging
Analytics error logging
Authentication error logging
Request correlation IDs
Safe production error responses
Error monitoring integration point
Log sanitization
Development vs production logging behavior
Operational documentation
Tests
1. Inspect Existing Logging

First inspect the existing project.

Look for:

console.log
console.error
console.warn
logger
logging utilities
error handlers
middleware
error boundaries

Determine whether a logging library already exists.

If a suitable logging system already exists:

Extend and standardize it instead of creating a second logging system.

Do not introduce duplicate logging frameworks.

2. Logging Architecture

Create a centralized logging abstraction.

Conceptually:

Application
    ↓
Logger
    ↓
Structured Log
    ↓
Console / Monitoring Provider

Possible structure:

src/
├── lib/
│   └── logging/
│       ├── logger.ts
│       ├── sanitize.ts
│       └── errors.ts

Adapt to the actual project structure.

Do not blindly create these exact paths if the project already has an equivalent architecture.

3. Structured Logging

Logs should use structured information where practical.

A log entry may contain:

timestamp
level
message
requestId
shopId
shopDomain
operation
component
errorCode
duration

Only include fields that are safe and useful.

Example conceptual structure:

{
  "level": "error",
  "message": "Bundle creation failed",
  "operation": "create_bundle",
  "requestId": "...",
  "shopId": "...",
  "errorCode": "BUNDLE_CREATE_FAILED"
}

Do not log secrets.

4. Log Levels

Support appropriate levels such as:

DEBUG
INFO
WARN
ERROR

Use them consistently.

DEBUG

Development/debugging information that should not normally be emitted at high production volume.

INFO

Normal operational events.

WARN

Unexpected but recoverable conditions.

ERROR

Failures requiring investigation.

Do not log every normal request as an ERROR.

5. Request Correlation ID

Implement a request correlation mechanism where appropriate.

The purpose is to connect:

Request
 ↓
API handler
 ↓
Service
 ↓
Database/Shopify
 ↓
Error

using a shared identifier.

Example:

requestId

If the project already has a request ID mechanism, reuse it.

Do not create multiple competing correlation ID systems.

6. Request Logging

Review API request logging.

Useful safe information may include:

requestId
HTTP method
route
status code
duration
shop context

Do not log:

Authorization
Cookie
Set-Cookie
Shopify access token
App secret
Database credentials
Full request body

unless a specific field has been explicitly sanitized and is safe.

7. Sensitive Data Sanitization

Create or improve a centralized sanitization layer.

Potential sensitive keys include:

token
accessToken
access_token
clientSecret
client_secret
appSecret
app_secret
password
authorization
cookie
set-cookie
databaseUrl
DATABASE_URL
apiKey
api_key

The sanitizer must prevent accidental secret exposure.

Do not rely on individual developers remembering to remove secrets from every log statement.

8. Shopify Access Token Protection

Never log Shopify access tokens.

This includes:

Successful authentication
API requests
API errors
Webhooks
Product synchronization
Billing
Debug logs

If an error object contains sensitive request metadata, sanitize it before logging.

9. Error Classification

Create a consistent application error structure.

Conceptually:

ApplicationError
├── code
├── message
├── statusCode
├── category
├── retryable
└── cause

Possible categories:

AUTHENTICATION
AUTHORIZATION
VALIDATION
SHOPIFY
DATABASE
BUNDLE
ANALYTICS
BILLING
WEBHOOK
INTERNAL

Use only categories that make sense for the actual application.

10. Public vs Internal Error Messages

Separate:

Internal Error

from:

Customer/Merchant Error

For example, the internal log may contain:

Database constraint violation

while the merchant receives:

Unable to save the bundle. Please try again.

Never expose:

Stack traces
SQL queries
Database paths
Environment variables
Access tokens
Internal service configuration
11. Centralized API Error Handling

Review API routes and standardize error handling.

The flow should conceptually be:

API Request
   ↓
Route
   ↓
Service
   ↓
Error
   ↓
Central Error Handler
   ↓
Safe HTTP Response
   ↓
Structured Log

Do not duplicate large try/catch blocks with inconsistent behavior across every endpoint.

Reuse existing utilities where possible.

12. Error Codes

Use stable machine-readable error codes where appropriate.

Examples:

AUTH_REQUIRED
FORBIDDEN
INVALID_INPUT
SHOP_NOT_FOUND
BUNDLE_NOT_FOUND
PRODUCT_NOT_FOUND
SHOPIFY_API_ERROR
DATABASE_ERROR
WEBHOOK_INVALID
BILLING_ERROR
INTERNAL_ERROR

Do not create dozens of unnecessary codes.

Error codes should help debugging and frontend handling.

13. Shopify API Error Monitoring

Review all Shopify API calls.

Failures should capture safe diagnostic information such as:

operation
shop context
Shopify endpoint/category
HTTP status
requestId
error category

Do not log:

access token
full Authorization header
private request payloads

Where Shopify provides useful error codes/messages, preserve only the safe information required for debugging.

14. Shopify API Retry Classification

Where applicable, classify Shopify API failures as:

Retryable
Non-retryable
Unknown

Examples may include:

Temporary network failure
Temporary service error
Rate-limit response
Invalid request
Authentication failure

Do not automatically retry every error.

Avoid retry storms.

15. Webhook Monitoring

Review:

ACTION-011-shopify-webhooks.md

Webhook processing should log:

topic
shop context
event ID
request ID
processing status
duration
error category

Do not log the entire webhook payload by default.

If a safe payload field is required for debugging, log only the minimum necessary information.

16. Webhook Failure Tracking

Track webhook failures in a way that makes investigation possible.

At minimum, logs should identify:

Which event?
Which shop?
When?
Why?
Was it a duplicate?
Was it processed?
Did it fail?

If the existing webhook persistence model supports failure tracking, reuse it.

Do not create duplicate persistence mechanisms unnecessarily.

17. Product Sync Monitoring

Review:

ACTION-012-product-sync.md

Log important synchronization failures.

Useful information:

shopId
sync operation
product count where safe
sync duration
failure category

Do not log full product payloads unnecessarily.

Avoid logging customer or merchant-sensitive information.

18. Bundle Engine Monitoring

Review:

ACTION-005-bundle-engine.md

Monitor failures such as:

Invalid bundle configuration
Missing product
Missing variant
Invalid discount
Database failure
Publishing failure

Use stable error codes where appropriate.

Do not log every successful bundle operation at ERROR level.

19. Analytics Monitoring

Review:

ACTION-008-analytics-system.md

Analytics failures should be observable without blocking the customer experience.

For example:

Customer
 ↓
Add Bundle
 ↓
Cart succeeds
 ↓
Analytics write fails
 ↓
Log analytics failure

The customer should not receive a purchase failure merely because analytics logging failed.

20. Billing Monitoring

Review:

ACTION-009-billing-system.md

Monitor:

Subscription creation failure
Subscription update failure
Cancellation failure
Shopify billing API failure
Invalid subscription state

Never log:

Payment credentials
Access tokens
Sensitive billing payloads

Only log the minimum operational information needed.

21. Authentication Monitoring

Monitor important authentication failures.

Examples:

Invalid OAuth callback
Invalid shop
Invalid session
Expired session
Unauthorized API request

Avoid logging credentials or sensitive request data.

Repeated authentication failures may be useful as security signals.

22. Database Error Monitoring

Review Prisma/database errors.

Log safe information such as:

operation
model
error category
requestId
shop context

Do not log:

DATABASE_URL
database password
raw credentials

Do not return raw Prisma errors to the browser.

23. Unhandled Errors

Add a strategy for unhandled server-side errors.

Where supported by the architecture:

Unhandled Error
 ↓
Log
 ↓
Error Monitoring
 ↓
Safe Response

Do not silently swallow unexpected errors.

Do not expose internal error details to users.

24. Frontend Error Handling

Review the merchant dashboard.

Implement or improve appropriate:

Error boundaries
API error handling
User-friendly error states
Retry actions

A single component failure should not unnecessarily crash the entire dashboard.

25. Storefront Error Handling

Review the customer-facing storefront.

Errors should fail gracefully.

For example:

Bundle API failure
↓
Friendly storefront message
↓
Retry option where appropriate

Do not expose:

Stack traces
API internals
Database information
Merchant secrets

Storefront errors should not reveal private merchant information.

26. Error Monitoring Provider

Create an abstraction that allows an external monitoring provider to be added or configured.

If the project already uses a monitoring provider:

Reuse it.

If no provider exists, create a clean integration boundary rather than forcing an unnecessary third-party service.

Possible abstraction:

captureException(error, context)
captureMessage(message, context)

The implementation must not require a paid monitoring service just to run the application.

27. Environment Configuration

If an external monitoring provider is already configured or approved by the project architecture, document its environment variables.

Never hardcode:

monitoring DSN
API key
secret

into source code.

If no provider is configured, do not invent production credentials.

28. Development vs Production

Logging behavior should be appropriate for each environment.

Development may include:

DEBUG

information.

Production should prioritize:

INFO
WARN
ERROR

and avoid excessive debug output.

Do not completely disable useful production errors.

29. Log Volume

Avoid logging excessively inside:

loops
product synchronization
analytics event processing
large webhook batches

Do not generate thousands of duplicate logs for a single failure.

Use aggregated information where appropriate.

30. Performance

Logging must not become a significant performance bottleneck.

Avoid:

Synchronous heavy logging
Serializing huge payloads
Logging entire database objects
Logging full Shopify responses
Repeated expensive formatting

Log only the necessary information.

31. Security Requirements

The logging system MUST preserve all controls from:

ACTION-017-security-hardening.md

Never log:

Shopify access tokens
App secrets
Database passwords
Session secrets
Payment credentials
Authorization headers
Cookie values

Do not log raw personal/customer information unless explicitly required and safe.

32. Monitoring Health

If appropriate, provide a basic mechanism for determining whether the application logging/monitoring system itself is functioning.

Do not make the application fail simply because an external monitoring provider is temporarily unavailable.

Observability must not become a single point of failure.

33. Testing

Create tests for:

Logger
Correct log level
Structured fields
Request ID propagation
Sanitization

Verify sensitive values are removed from:

accessToken
authorization
cookie
password
apiKey
secret
databaseUrl
Error Handling
Application error
Validation error
Authorization error
Shopify error
Database error
Unknown error
API
Safe error response
Internal details not exposed
Webhooks
Failure is logged
Secrets are not logged
Billing
Billing failure logged safely
Analytics
Analytics failure logged
Customer flow remains successful
34. Type Safety

Use TypeScript throughout.

Avoid unnecessary:

any

Create appropriate types for:

LogLevel
LogContext
ApplicationError
ErrorCategory
MonitoringContext

Do not weaken type checking.

35. Documentation Updates

Update:

docs/13-SECURITY.md

where logging/security behavior needs to be documented.

Also update:

docs/14-TESTING_STRATEGY.md

if new monitoring/error tests are added.

If the architecture changes materially, update:

docs/02-ARCHITECTURE.md

Document:

Logging architecture
Error categories
Sanitization
Request IDs
Monitoring integration
Production behavior

Only document controls that actually exist.

36. Validation Commands

Run the actual project validation commands.

Attempt:

npm run lint
npm run typecheck
npm test
npm run build

If the project has an actual monitoring/error-specific test command, run it as well.

If a command does not exist:

Do not invent it.
Report it honestly.
37. Final Verification Checklist

Before marking this action complete:

 Existing logging inspected
 Centralized logger implemented/reused
 Structured logging implemented
 Log levels implemented
 Request correlation ID implemented/reused
 Sensitive data sanitizer implemented
 Shopify tokens protected
 Application error structure implemented
 Public/internal errors separated
 API error handling standardized
 Stable error codes implemented where appropriate
 Shopify API errors monitored
 Webhook errors monitored
 Product sync errors monitored
 Bundle engine errors monitored
 Analytics errors monitored
 Billing errors monitored
 Authentication failures monitored
 Database errors monitored
 Unhandled errors handled
 Dashboard error boundaries reviewed
 Storefront error handling reviewed
 Monitoring provider integration boundary implemented/reused
 Environment configuration secured
 Development/production logging behavior reviewed
 Log volume reviewed
 Logging performance reviewed
 Security requirements preserved
 Tests created
 Documentation updated
 Lint checked
 Typecheck checked
 Tests checked
 Build checked
Important Restrictions

DO NOT implement:

New MVP features
New bundle types
New billing features
New analytics features
AI features
Complex distributed logging infrastructure
Complex message queues
Unnecessary third-party monitoring services
Customer-facing debugging tools
Unrelated refactoring

Do not make the application dependent on an external monitoring provider for normal operation.

Keep this action focused on:

Production Error Monitoring and Secure Structured Logging.

Completion Report

When finished, provide:

1. Monitoring Summary

Explain the implemented observability system.

2. Logger

Explain:

Log levels
Structured fields
Request IDs
3. Error Handling

Explain:

Error categories
Error codes
Public vs internal errors
4. Security

Explain how sensitive information is prevented from appearing in logs.

5. Monitoring Coverage

Report coverage for:

Authentication:
Shopify API:
Webhooks:
Products:
Bundles:
Analytics:
Billing:
Database:
Storefront:
Dashboard:
6. External Monitoring

State whether an external monitoring provider was:

Already present and reused
Added
Not configured, with integration boundary prepared

Do not claim a provider is active unless it is actually configured.

7. Files Created

List every new file.

8. Files Modified

List every modified file.

9. Tests

List tests created/run and actual results.

10. Validation

Report actual results:

Lint:
Typecheck:
Tests:
Build:
11. Issues

List unresolved issues honestly.

12. Next Action

After completing this action, the next planned action is:

ACTION-019-production-deployment.md

Do not execute the next action automatically.
```
