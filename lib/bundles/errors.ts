import { ApiError } from "@/lib/api/errors";
import type { ValidationIssue } from "./types";

// Cross-tenant access deliberately reports "not found" (not 403): a scoped
// query can't tell "someone else's bundle" from "no such bundle", and
// answering differently would let one merchant probe for another's IDs.
export const bundleNotFound = () => new ApiError("BUNDLE_NOT_FOUND", "Bundle not found.", 404);

export const validationFailed = (issues: ValidationIssue[]) =>
  new ApiError("VALIDATION_ERROR", "Bundle validation failed.", 422, issues);

export const cannotPublish = (issues: ValidationIssue[]) =>
  new ApiError(
    "BUNDLE_CANNOT_BE_PUBLISHED",
    "This bundle isn't ready to publish yet.",
    422,
    issues,
  );

export const alreadyActive = () =>
  new ApiError("BUNDLE_ALREADY_ACTIVE", "This bundle is already active.", 409);

export const notEditable = () =>
  new ApiError(
    "BUNDLE_NOT_EDITABLE",
    "Active bundles can't be edited. Deactivate the bundle first.",
    409,
  );

export const invalidTransition = (message: string) =>
  new ApiError("INVALID_STATUS_TRANSITION", message, 409);

export const invalidTemplate = () =>
  new ApiError("INVALID_TEMPLATE", "The selected template doesn't exist.", 422);

export const concurrentModification = () =>
  new ApiError(
    "CONFLICT",
    "This bundle was changed by another request. Refresh and try again.",
    409,
  );

// Shopify discount sync (ACTION-007). Messages are merchant-safe: no Shopify
// response bodies, ids, or tokens.
export const discountSyncFailed = () =>
  new ApiError(
    "DISCOUNT_SYNC_FAILED",
    "We couldn't set up this bundle's checkout discount with Shopify. Nothing was changed. Please try again.",
    502,
  );

export const discountPermissionRequired = () =>
  new ApiError(
    "DISCOUNT_PERMISSION_REQUIRED",
    "BundleCraft needs permission to manage discounts. Reopen the app from your Shopify admin and approve the new permission, then try again.",
    502,
  );
