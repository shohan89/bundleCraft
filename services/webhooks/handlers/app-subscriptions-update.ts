import { prisma } from "@/lib/prisma";
import { syncSubscription } from "@/services/billing/subscriptions";
import type { WebhookHandler } from "../types";

/**
 * app_subscriptions/update -> re-read the subscription from Shopify and sync.
 * The payload only says WHICH subscription changed; the resulting plan and status
 * come from Shopify's own answer, checked against our plan config, and only this
 * shop's own subscription rows are considered.
 */
export const handleSubscriptionUpdate: WebhookHandler = async ({ shop, resourceId }) => {
  if (!resourceId) return { ignored: true };
  const known = await prisma.subscription.findFirst({
    where: { shopId: shop.id, shopifyChargeId: resourceId },
    select: { id: true },
  });
  if (!known) return { ignored: true }; // not one of this shop's subscriptions

  const settled = await syncSubscription(shop.id, resourceId);
  return { status: settled.status };
};
