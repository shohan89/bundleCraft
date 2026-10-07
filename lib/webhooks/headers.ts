export interface WebhookHeaders {
  hmac: string | null;
  topic: string | null;
  shopDomain: string | null;
  /** Shopify's own event identifier, identical on every redelivery of the same event. */
  eventId: string | null;
  /** When Shopify says the event happened (not when it was delivered). */
  triggeredAt: Date | null;
}

const EVENT_ID = /^[A-Za-z0-9._:/-]{1,128}$/;

/**
 * Reads the Shopify webhook headers. Nothing here is trusted until the HMAC
 * over the body has been verified; `eventId` is only accepted in a safe shape
 * so it can never carry surprises into the database.
 */
export function readWebhookHeaders(headers: Headers): WebhookHeaders {
  const eventRaw = headers.get("x-shopify-event-id") ?? headers.get("x-shopify-webhook-id");
  const triggeredRaw = headers.get("x-shopify-triggered-at");
  const triggered = triggeredRaw ? new Date(triggeredRaw) : null;
  return {
    hmac: headers.get("x-shopify-hmac-sha256"),
    topic: headers.get("x-shopify-topic"),
    shopDomain: headers.get("x-shopify-shop-domain"),
    eventId: eventRaw && EVENT_ID.test(eventRaw) ? eventRaw : null,
    triggeredAt: triggered && !Number.isNaN(triggered.getTime()) ? triggered : null,
  };
}

/** Fallback identity when Shopify sent no event id: a redelivery carries the identical body. */
export async function bodyEventId(rawBody: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `body:${hex}`;
}
