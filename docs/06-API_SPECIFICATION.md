# BundleCraft API Specification

## API Architecture

Backend:

Next.js API Routes

Format:

REST API

Authentication:

Shopify OAuth Session

---

# Base URL

Development:

/api

Production:

/api

---

# Authentication APIs

## POST

/api/auth/shopify

Purpose:

Start Shopify OAuth flow.

---

# Bundle APIs

## GET

/api/bundles

Purpose:

Get merchant bundles.

Response:

````json
{
 bundles:[]
}

POST

/api/bundles

Purpose:

Create new bundle.

Request:

{
title:"Summer Outfit",
type:"fixed",
discount:20
}

GET

/api/bundles/:id

Purpose:

Get bundle details.

PUT

/api/bundles/:id

Purpose:

Update bundle.

DELETE

/api/bundles/:id

Purpose:

Delete bundle.

Product APIs
GET

/api/products

Purpose:

Fetch Shopify products.

Analytics APIs
POST

/api/analytics/event

Purpose:

Track events.

Event:

view

add_to_cart

purchase

Billing APIs
POST

/api/billing/create

Purpose:

Create Shopify subscription.

Security Rules

Every API must:

Validate session
Check shop ownership
Validate input
Handle errors

---

# File 4: `docs/07-AUTHENTICATION.md`

```md
# BundleCraft Authentication System


## Authentication Goal


Secure Shopify merchant access.


System must support:


- Shopify OAuth
- Session management
- Merchant isolation



---

# Authentication Flow



Merchant installs app


↓

Shopify OAuth


↓

Permission approval


↓

Receive access token


↓

Save encrypted token


↓

Create shop record


↓

Create session


↓

Dashboard access



---

# OAuth Process



Step 1


Merchant opens app



Step 2


Redirect to Shopify authorization



Step 3


Shopify returns code



Step 4


Exchange code for access token



Step 5


Store token securely



---

# Session Management



Use:


Shopify App Session


Store:


- Shop ID
- User ID
- Expiry



---

# Security Rules



Never:


Store plain access token


Expose credentials


Trust frontend requests


---

# Authorization


Every request must verify:


1. User authenticated


2. Shop exists


3. User owns shop


4. Permission allowed



---

# Future Authentication


Support:


- Team members
- Staff permissions
- Multiple users per store
````
