import { ApiError } from "@/lib/api/errors";
import { PLANS } from "./plans";
import type { Feature } from "./types";

// Messages are merchant-safe: no Shopify response bodies, ids, tokens or internals.

export const invalidPlan = () =>
  new ApiError(
    "INVALID_PLAN",
    "Choose Starter, Growth or Pro. To go back to the Free plan, cancel your subscription.",
    400,
  );

export const subscriptionAlreadyActive = (planName: string) =>
  new ApiError("SUBSCRIPTION_ALREADY_ACTIVE", `You are already on the ${planName} plan.`, 409);

export const subscriptionNotFound = () =>
  new ApiError("SUBSCRIPTION_NOT_FOUND", "There is no active subscription to cancel.", 404);

export const billingCreationFailed = () =>
  new ApiError(
    "BILLING_CREATION_FAILED",
    "We couldn't start the subscription with Shopify. Nothing was charged. Please try again.",
    502,
  );

export const cancelFailed = () =>
  new ApiError(
    "SUBSCRIPTION_CANCEL_FAILED",
    "We couldn't cancel your subscription with Shopify. Your plan has not changed. Please try again.",
    502,
  );

export const billingVerificationFailed = () =>
  new ApiError(
    "BILLING_VERIFICATION_FAILED",
    "We couldn't confirm this subscription with Shopify, so your plan has not changed.",
    502,
  );

export const shopifyApiError = () =>
  new ApiError(
    "SHOPIFY_API_ERROR",
    "Shopify is not available right now. Please try again in a moment.",
    502,
  );

export const planLimitReached = (limit: number) =>
  new ApiError(
    "PLAN_LIMIT_REACHED",
    `Your current plan allows ${limit} active ${limit === 1 ? "bundle" : "bundles"}. Upgrade your plan to publish more.`,
    403,
  );

const FEATURE_LABEL: Record<Feature, string> = {
  templates: "Templates",
  customization: "Customization",
  analytics: "Analytics",
  removeBranding: "Removing branding",
  multipleStores: "Multiple stores",
  advancedReports: "Advanced reports",
};

/** The cheapest plan that includes `feature`, for the upgrade message. */
function lowestPlanWith(feature: Feature): string {
  const plan = Object.values(PLANS)
    .sort((a, b) => a.rank - b.rank)
    .find((candidate) => candidate.features[feature]);
  return plan?.name ?? "a higher";
}

export const featureUnavailable = (feature: Feature) =>
  new ApiError(
    "PLAN_FEATURE_UNAVAILABLE",
    `${FEATURE_LABEL[feature]} is not included in your current plan. Upgrade to ${lowestPlanWith(feature)} to use it.`,
    403,
  );
