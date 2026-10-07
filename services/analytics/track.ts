import type { ClientEventInput } from "@/lib/analytics/validation";
import { prisma } from "@/lib/prisma";
import { unavailable } from "@/services/storefront/cart";

/**
 * Persists a storefront bundle_view / bundle_add.
 *
 * Trust: the shop is the signed App Proxy shop (resolved by the route),
 * never something in the payload; the bundle must be an ACTIVE bundle of
 * that shop, so an event can't point at another tenant's bundle; the bundle
 * type comes from our database, not the browser. Nothing about the shopper
 * is stored (no IP, user agent, cart contents or customer id), only the
 * random event/instance ids the widget generated.
 *
 * Idempotent: the event key is unique per shop, so a retried request, a
 * double click or a re-sent beacon inserts one row. A view's key is the
 * page-load's event id; an add's key is its cart instance id (one
 * successful cart add = one event, however often it is reported).
 *
 * These two events are client-reported and therefore low-trust counters;
 * they carry no revenue (purchases are recorded server-side from orders).
 */
export async function trackStorefrontEvent(
  shopId: string,
  input: ClientEventInput,
): Promise<{ recorded: boolean }> {
  const bundle = await prisma.bundle.findFirst({
    where: { id: input.bundleId, shopId, status: "active" },
    select: { id: true, bundleType: true },
  });
  if (!bundle) throw unavailable();

  const eventKey =
    input.event === "bundle_view"
      ? `view:${input.eventId}`
      : `add:${input.instanceId ?? input.eventId}`;

  const { count } = await prisma.analyticsEvent.createMany({
    data: [
      {
        shopId,
        bundleId: bundle.id,
        eventType: input.event,
        eventKey,
        metadataJson: {
          source: "storefront",
          bundleType: bundle.bundleType,
          ...(input.instanceId ? { instanceId: input.instanceId } : {}),
        },
      },
    ],
    skipDuplicates: true,
  });
  return { recorded: count === 1 };
}
