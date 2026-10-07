/**
 * The single source of truth for plans: names, prices, features and limits.
 * Values come from docs/12-BILLING_SYSTEM.md and tasks/phase-09-billing.
 * Nothing else in the codebase may hard-code a plan name, price or limit.
 *
 * Tiers are cumulative: each plan includes everything in the plans below it
 * (docs/12 lists only what each tier adds; the task document's example
 * config shows Growth with unlimited bundles, i.e. Starter's benefits carry
 * up). Changing pricing means editing this file only.
 */
import type { Feature, PaidPlanId, PlanId } from "./types";
import { PAID_PLAN_IDS, PLAN_IDS } from "./types";

export const BILLING_CURRENCY = "USD";
/** Shopify's recurring interval for a monthly app subscription. */
export const BILLING_INTERVAL = "EVERY_30_DAYS";

export interface PlanLimits {
  /** Bundles that may be ACTIVE at once. null = unlimited. */
  activeBundles: number | null;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  /** Monthly price in BILLING_CURRENCY. 0 for Free. */
  price: number;
  /** Position in the upgrade ladder; higher = bigger plan. */
  rank: number;
  limits: PlanLimits;
  features: Record<Feature, boolean>;
  /** Bullets for the pricing card, exactly as documented. */
  highlights: string[];
}

const NONE: Record<Feature, boolean> = {
  templates: false,
  customization: false,
  analytics: false,
  removeBranding: false,
  multipleStores: false,
  advancedReports: false,
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    rank: 0,
    limits: { activeBundles: 1 },
    features: { ...NONE },
    highlights: ["1 active bundle", "Basic widget", "Shopify branding"],
  },
  starter: {
    id: "starter",
    name: "Starter",
    price: 19,
    rank: 1,
    limits: { activeBundles: null },
    features: { ...NONE, templates: true, customization: true },
    highlights: ["Unlimited bundles", "Templates", "Customization"],
  },
  growth: {
    id: "growth",
    name: "Growth",
    price: 39,
    rank: 2,
    limits: { activeBundles: null },
    features: {
      ...NONE,
      templates: true,
      customization: true,
      analytics: true,
      removeBranding: true,
    },
    highlights: ["Everything in Starter", "Analytics", "Remove branding"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 79,
    rank: 3,
    limits: { activeBundles: null },
    features: {
      templates: true,
      customization: true,
      analytics: true,
      removeBranding: true,
      multipleStores: true,
      advancedReports: true,
    },
    highlights: ["Everything in Growth", "Multiple stores", "Advanced reports"],
  },
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return typeof value === "string" && (PAID_PLAN_IDS as readonly string[]).includes(value);
}

/** Throws RangeError for an unknown plan: callers validate input before this. */
export function getPlan(id: string): PlanDefinition {
  if (!isPlanId(id)) throw new RangeError(`Unknown plan: ${String(id)}`);
  return PLANS[id];
}

export const allPlans = (): PlanDefinition[] => PLAN_IDS.map((id) => PLANS[id]);

export type PlanChange = "current" | "upgrade" | "downgrade";

/** How choosing `target` relates to the plan in force. */
export function planChange(current: PlanId, target: PlanId): PlanChange {
  const a = PLANS[current].rank;
  const b = PLANS[target].rank;
  return a === b ? "current" : b > a ? "upgrade" : "downgrade";
}

/** What Shopify must be charged for a paid plan. The server decides this, never the client. */
export function billingTerms(id: PaidPlanId): {
  name: string;
  amount: number;
  currencyCode: string;
  interval: string;
} {
  const plan = PLANS[id];
  return {
    name: `BundleCraft ${plan.name}`,
    amount: plan.price,
    currencyCode: BILLING_CURRENCY,
    interval: BILLING_INTERVAL,
  };
}
