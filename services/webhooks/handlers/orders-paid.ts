import { recordOrderPurchases } from "@/services/analytics/purchases";
import type { WebhookHandler } from "../types";

/**
 * orders/paid -> bundle_purchase events. All attribution rules (revenue from the
 * order's own line money, only this shop's bundles, one event per order and bundle
 * instance) live in services/analytics/purchases.ts; this only hands the order over.
 */
export const handleOrdersPaid: WebhookHandler = async ({ shop, payload }) =>
  recordOrderPurchases(shop.id, payload);
