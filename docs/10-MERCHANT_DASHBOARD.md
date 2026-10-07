# Merchant Dashboard Architecture

## Purpose

Provide Shopify merchants a simple interface to create and manage bundles.

---

# Dashboard Structure

/dashboard

Pages:

## Home

Shows:

- Revenue generated
- Active bundles
- Performance overview

---

## Bundles

Features:

List bundles

Columns:

- Name
- Status
- Revenue
- Actions

Actions:

- Edit
- Duplicate
- Delete

---

## Create Bundle Wizard

Steps:

Step 1:

Choose template

Step 2:

Select products

Step 3:

Set discount

Step 4:

Customize design

Step 5:

Publish

---

## Analytics

Shows:

- Bundle views
- Adds
- Purchases
- Revenue
- Conversion rate

---

## Settings

Contains:

- Store settings
- Billing
- Support

---

# UI Requirements

Design:

- Simple
- Premium
- Beginner friendly

Target user:

Non technical Shopify merchant.

# Merchant Dashboard Architecture

## Purpose

Provide Shopify merchants a simple interface to create and manage bundles.

---

# Dashboard Structure

/dashboard

Pages:

## Home

Shows:

- Revenue generated
- Active bundles
- Performance overview

---

## Bundles

Features:

List bundles

Columns:

- Name
- Status
- Revenue
- Actions

Actions:

- Edit
- Duplicate
- Delete

---

## Create Bundle Wizard

Steps:

Step 1:

Choose template

Step 2:

Select products

Step 3:

Set discount

Step 4:

Customize design

Step 5:

Publish

---

## Analytics

Shows:

- Bundle views
- Adds
- Purchases
- Revenue
- Conversion rate

---

## Settings

Contains:

- Store settings
- Billing
- Support

---

# UI Requirements

Design:

- Simple
- Premium
- Beginner friendly

Target user:

Non technical Shopify merchant.


---

# Product selection (ACTION-012)

The wizard's Products step lists the shop's real synced products (search, 20 per page), syncs on first use
or on request with progress and an error/retry state, asks for a variant when a product has several,
prevents adding the same variant twice, edits quantity (1 to 100), flags selected products that are sold
out, no longer available or unknown, and sends only ids and quantities when saving. A draft can be saved
with no products; publishing checks them on the server.


---

# Template step (ACTION-014)

Step 1 of Create Bundle shows the active templates as cards grouped under Fashion and Beauty (a radio group per
category, keyboard operable). Choosing a card only previews it: purpose, the kind of bundle it makes, the
starting discount and layout, and the suggested product roles as dashed placeholder slots (no product images).
"Use this template" applies the starting values; an applied template is marked "In use", and "Reset to
template defaults" re-applies them. Next stays disabled until a template is applied. Bundle name and type stay
editable on the same step, and every later step can change the defaults. No Shopify data is loaded until the
merchant reaches the Products step.

Editing an existing bundle: its template is shown as in use; a bundle without a template (or with a retired one,
named in a short notice) can still move through the steps and be saved. The review step shows "None (not
started from a template)" when there is none.


---

# Design step (ACTION-015)

The Design step of Create/Edit Bundle has controls in five groups: **Layout** (layout, spacing), **Colors** (primary,
button, background, accent, text), **Typography** (font, font size, heading size, description size), **Cards** (corner
radius, shadow) and **Button** (style, size), next to a live **Preview**. Each color has the native color picker and a
`#RRGGBB` text field: half-typed or invalid text shows an error and is never applied, so only valid colors reach the
design. The other choices are lists. Contrast advice appears (non-blocking) when text, heading or accent colors
are hard to read on the background, or an outline button is; the button label color is chosen automatically.

The preview renders the real storefront widget and landing card (`mountBundle`, `mountListing`) from the current
values, with the merchant's chosen products or clearly labelled samples; it makes no network calls and is
`inert`. Switch between "Product page" and "Bundles page". "Reset to template design" (or "Reset to defaults" when
there is no template) restores the starting design; nothing is saved until the merchant saves the bundle. Next is
disabled while the font size is invalid. Saving uses the bundle save (POST/PATCH `/api/bundles`) with the nested
`customization`; the dedicated customization API (`docs/06`) offers the same rules for direct use.
