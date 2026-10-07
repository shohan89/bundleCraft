import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/log";
import { invalidateStorefrontShop } from "@/lib/api/storefront";
import type { WebhookHandler } from "../types";

/**
 * Shopify's mandatory privacy webhooks.
 *
 * BundleCraft keeps NO personal data about shoppers: analytics rows hold a bundle id, an event
 * type, a Shopify order reference, an amount and a currency; the storefront events carry only
 * random ids; nothing stores a name, email, address, phone, IP, customer id or cart contents. So:
 *
 * - customers/data_request: there is no customer data to return. Acknowledged and recorded (the
 *   webhook_events row is the audit trail that the request was received).
 * - customers/redact: there is no customer data to erase. Acknowledged and recorded.
 * - shop/redact: sent by Shopify 48 hours after the app was uninstalled, asking for ALL of the
 *   shop's data to be erased. The shop row is deleted and every table that belongs to it goes with
 *   it (bundles, products, customizations, analytics, subscriptions and webhook history all cascade
 *   from the shop). If the shop has REINSTALLED since (it is active again) the request is stale and
 *   nothing is deleted. The shop is the one named by the verified header, never by the payload.
 *
 * None of these read the payload for identity, and none log it.
 */
export const handleCompliance: WebhookHandler = async ({ shop, topic }) => {
  if (topic === "customers/data_request" || topic === "customers/redact") {
    return { customerDataHeld: false };
  }

  // shop/redact
  const current = await prisma.shop.findUnique({
    where: { id: shop.id },
    select: { status: true },
  });
  if (!current) return { redacted: true };
  if (current.status === "active") {
    logEvent("warn", "shop_redact_skipped_reinstalled", { shopId: shop.id });
    return { redacted: false, reason: "reinstalled" };
  }

  await prisma.shop.delete({ where: { id: shop.id } });
  invalidateStorefrontShop(shop.shopDomain);
  logEvent("info", "shop_redacted", { shopId: shop.id });
  return { redacted: true };
};
