import { eventLimiter } from "@/lib/api/limiters";
import { clientKey, enforceRateLimit } from "@/lib/api/rate-limit";
import { readJsonBody } from "@/lib/api/guard";
import { toErrorResponse } from "@/lib/api/response";
import { actionJson, authenticateStorefrontRequest } from "@/lib/api/storefront";
import { parseClientEvent } from "@/lib/analytics/validation";
import { trackStorefrontEvent } from "@/services/analytics/track";

/**
 * bundle_view / bundle_add from the storefront widget, through Shopify's
 * App Proxy (this is the storefront-safe form of the analytics event API:
 * /api/analytics/* sits behind the merchant session, which customers don't
 * have). The shop comes from the verified proxy signature only.
 */
export async function POST(request: Request) {
  try {
    const shop = await authenticateStorefrontRequest(request);
    // Per verified shop and client: bounds a widget bug or retry loop (see lib/api/rate-limit.ts).
    enforceRateLimit(eventLimiter, `${shop.id}:${clientKey(request)}`);
    const event = parseClientEvent(await readJsonBody(request));
    const { recorded } = await trackStorefrontEvent(shop.id, event);
    return actionJson({ accepted: true, recorded }, 202);
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
