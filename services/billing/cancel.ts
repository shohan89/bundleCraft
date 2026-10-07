import { cancelFailed, subscriptionNotFound } from "@/lib/billing/errors";
import type { CancelBillingResponse } from "@/lib/billing/types";
import { prisma } from "@/lib/prisma";
import { getEffectivePlan, syncSubscription, toBillingError } from "./subscriptions";
import { openBillingGateway } from "./gateway";

/**
 * POST /api/billing/cancel. Cancels the shop's active paid subscription at
 * Shopify, then reads the result back before changing anything locally, so
 * the merchant is never shown as cancelled while Shopify still bills them.
 * The row is kept (status `cancelled`) as history; the shop falls back to
 * the Free plan. Cancelling again finds no active subscription and changes
 * nothing.
 *
 * Bundles that were active stay active (nothing is deleted or switched off);
 * the Free plan's limit then only stops further publishing.
 */
export async function cancelSubscription(shopId: string): Promise<CancelBillingResponse> {
  try {
    const active = await prisma.subscription.findFirst({
      where: { shopId, status: "active" },
      orderBy: { startedAt: "desc" },
    });
    if (!active) throw subscriptionNotFound();

    const gateway = await openBillingGateway(shopId);
    await gateway.cancelSubscription(active.shopifyChargeId);

    const settled = await syncSubscription(shopId, active.shopifyChargeId, gateway);
    if (settled.status === "active") throw cancelFailed();

    return { plan: await getEffectivePlan(shopId), status: settled.status };
  } catch (error) {
    throw toBillingError(error, cancelFailed, { shopId });
  }
}
