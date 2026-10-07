import type { WebhookTopic } from "@/lib/webhooks/registry";
import type { WebhookHandler } from "../types";
import { handleAppUninstalled } from "./app-uninstalled";
import { handleSubscriptionUpdate } from "./app-subscriptions-update";
import { handleCompliance } from "./compliance";
import { handleOrdersPaid } from "./orders-paid";
import { handleProductEvent } from "./products";

/** One handler per topic; the type forces every registered topic to have one. */
export const HANDLERS: Record<WebhookTopic, WebhookHandler> = {
  "app/uninstalled": handleAppUninstalled,
  "orders/paid": handleOrdersPaid,
  "app_subscriptions/update": handleSubscriptionUpdate,
  "products/create": handleProductEvent,
  "products/update": handleProductEvent,
  "products/delete": handleProductEvent,
  "customers/data_request": handleCompliance,
  "customers/redact": handleCompliance,
  "shop/redact": handleCompliance,
};
