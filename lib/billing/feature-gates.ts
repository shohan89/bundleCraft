/**
 * Pure feature-gate rules over the plan configuration. Services resolve the
 * shop's plan from the verified subscription (services/billing/access.ts)
 * and then call these; nothing here reads a request or a database.
 */
import { featureUnavailable, planLimitReached } from "./errors";
import { getPlan } from "./plans";
import type { Feature, PlanId } from "./types";

export function canUseFeature(plan: PlanId, feature: Feature): boolean {
  return getPlan(plan).features[feature];
}

export function assertFeature(plan: PlanId, feature: Feature): void {
  if (!canUseFeature(plan, feature)) throw featureUnavailable(feature);
}

/** null = unlimited. */
export function activeBundleLimit(plan: PlanId): number | null {
  return getPlan(plan).limits.activeBundles;
}

/** Whether one more bundle may become active, given how many already are. */
export function canActivateBundle(plan: PlanId, currentlyActive: number): boolean {
  const limit = activeBundleLimit(plan);
  return limit === null || currentlyActive < limit;
}

export function assertCanActivateBundle(plan: PlanId, currentlyActive: number): void {
  const limit = activeBundleLimit(plan);
  if (limit !== null && currentlyActive >= limit) throw planLimitReached(limit);
}
