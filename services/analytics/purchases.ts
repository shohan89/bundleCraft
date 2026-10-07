import { extractBundlePurchases } from "@/lib/analytics/purchase";
import { prisma } from "@/lib/prisma";

export interface RecordedPurchases {
  /** Purchase events newly stored. */
  recorded: number;
  /** Bundle instances found in the order that were not stored (duplicate delivery, foreign or unknown bundle). */
  skipped: number;
}

/**
 * bundle_purchase from a completed order. `shopId` is the shop whose signed
 * webhook delivered the order, the only tenant identity used. Revenue is
 * taken from the order itself (see lib/analytics/purchase.ts), never from
 * the browser.
 *
 * Only bundles that belong to that shop are recorded: a `_bundle_id`
 * property naming another shop's bundle matches nothing. One event per
 * (order, bundle instance), keyed so a redelivered webhook is a no-op.
 * Orders without bundle lines record nothing.
 *
 * Not handled (out of scope for this action): refunds, cancellations and
 * edits after payment do not reduce recorded revenue.
 */
export async function recordOrderPurchases(
  shopId: string,
  payload: unknown,
): Promise<RecordedPurchases> {
  const order = extractBundlePurchases(payload);
  if (!order || order.purchases.length === 0) return { recorded: 0, skipped: 0 };

  const owned = await prisma.bundle.findMany({
    where: { shopId, id: { in: [...new Set(order.purchases.map((p) => p.bundleId))] } },
    select: { id: true, bundleType: true },
  });
  const typeById = new Map(owned.map((bundle) => [bundle.id, bundle.bundleType]));
  const valid = order.purchases.filter((purchase) => typeById.has(purchase.bundleId));
  if (valid.length === 0) return { recorded: 0, skipped: order.purchases.length };

  const { count } = await prisma.analyticsEvent.createMany({
    data: valid.map((purchase) => ({
      shopId,
      bundleId: purchase.bundleId,
      eventType: "bundle_purchase" as const,
      eventKey: `purchase:${order.orderId}:${purchase.instanceId}`,
      revenue: purchase.revenue,
      currency: purchase.currency,
      orderId: order.orderId,
      metadataJson: {
        source: "order_webhook",
        bundleType: typeById.get(purchase.bundleId) ?? null,
        instanceId: purchase.instanceId,
        units: purchase.units,
      },
    })),
    skipDuplicates: true,
  });

  return { recorded: count, skipped: order.purchases.length - count };
}
