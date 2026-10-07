import type { ValidationIssue } from "@/lib/bundles/types";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "VALIDATION_ERROR"
  | "BUNDLE_NOT_FOUND"
  | "BUNDLE_ALREADY_ACTIVE"
  | "BUNDLE_NOT_EDITABLE"
  | "BUNDLE_CANNOT_BE_PUBLISHED"
  | "INVALID_STATUS_TRANSITION"
  | "INVALID_TEMPLATE"
  | "TEMPLATE_NOT_FOUND"
  | "CONFLICT"
  | "DISCOUNT_SYNC_FAILED"
  | "DISCOUNT_PERMISSION_REQUIRED"
  | "INVALID_PLAN"
  | "SUBSCRIPTION_ALREADY_ACTIVE"
  | "SUBSCRIPTION_NOT_FOUND"
  | "BILLING_CREATION_FAILED"
  | "BILLING_VERIFICATION_FAILED"
  | "SUBSCRIPTION_CANCEL_FAILED"
  | "SHOPIFY_API_ERROR"
  | "PLAN_LIMIT_REACHED"
  | "PLAN_FEATURE_UNAVAILABLE"
  | "PRODUCT_NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/**
 * An error that is always safe to show a client: the message is written
 * for merchants and never carries database, stack, or token detail.
 * Anything that isn't an ApiError is treated as unexpected and reported
 * as a generic 500 (see lib/api/response.ts).
 */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: ValidationIssue[],
    readonly options: { retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}
