import { assertCanActivateBundle, assertFeature } from "@/lib/billing/feature-gates";
import type { Feature } from "@/lib/billing/types";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockShopBilling } from "./lock";
import { getEffectivePlan } from "./subscriptions";

/**
 * Server-side entitlement checks. The plan is always resolved here from the
 * shop's verified subscription, keyed by the authenticated shop id: hiding a
 * button in the dashboard is only UX, these are what actually enforce it.
 */
export async function assertFeatureAccess(shopId: string, feature: Feature): Promise<void> {
  assertFeature(await getEffectivePlan(shopId), feature);
}

export async function hasFeatureAccess(shopId: string, feature: Feature): Promise<boolean> {
  try {
    await assertFeatureAccess(shopId, feature);
    return true;
  } catch {
    return false;
  }
}

/**
 * May one more bundle become active? Throws PLAN_LIMIT_REACHED if not. With
 * `tx`, the check runs under the shop's billing lock so two simultaneous
 * publishes cannot both slip in under a limit of one.
 */
export async function assertActiveBundleCapacity(
  shopId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  if (tx) await lockShopBilling(tx, shopId);
  const db = tx ?? prisma;
  const [plan, activeCount] = await Promise.all([
    getEffectivePlan(shopId),
    db.bundle.count({ where: { shopId, status: "active" } }),
  ]);
  assertCanActivateBundle(plan, activeCount);
}
