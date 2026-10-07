/**
 * Billing shapes shared by the API, services and dashboard. Dependency-free
 * (no Prisma, no server code) so client components can import them.
 */
export const PLAN_IDS = ["free", "starter", "growth", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** Plans a merchant can pay for (Free is the absence of a subscription). */
export const PAID_PLAN_IDS = ["starter", "growth", "pro"] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];

export const FEATURES = [
  "templates",
  "customization",
  "analytics",
  "removeBranding",
  "multipleStores",
  "advancedReports",
] as const;
export type Feature = (typeof FEATURES)[number];

export const SUBSCRIPTION_STATUSES = ["pending", "active", "cancelled", "expired"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface SubscriptionSummary {
  plan: PlanId;
  status: SubscriptionStatus;
  startedAt: string | null;
  cancelledAt: string | null;
  currentPeriodEnd: string | null;
  /** A Shopify test charge: no money moves. */
  isTest: boolean;
}

/** GET /api/billing/current */
export interface BillingState {
  /** The plan in force. Always derived server-side from the verified subscription. */
  plan: PlanId;
  /** `active` for the Free plan and for a verified paid subscription. */
  status: SubscriptionStatus;
  /** The paid subscription in force, or null on the Free plan. */
  subscription: SubscriptionSummary | null;
  /** A plan change waiting for the merchant's approval at Shopify. */
  pendingPlan: PaidPlanId | null;
  /** `unavailable` when Shopify could not be asked to confirm a pending change right now. */
  verification: "ok" | "unavailable";
  features: Record<Feature, boolean>;
  usage: {
    activeBundles: number;
    /** null = unlimited. */
    activeBundleLimit: number | null;
    overLimit: boolean;
  };
}

/** POST /api/billing/create */
export interface CreateBillingResponse {
  /** Shopify approval page. Nothing changes until the merchant approves and the server verifies it. */
  confirmationUrl: string;
  plan: PaidPlanId;
  /** True when an earlier pending request for the same plan was resumed. */
  resumed: boolean;
}

/** POST /api/billing/cancel */
export interface CancelBillingResponse {
  plan: PlanId;
  status: SubscriptionStatus;
}
