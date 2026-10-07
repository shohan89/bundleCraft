import { cartLimiter } from "@/lib/api/limiters";
import { clientKey, enforceRateLimit } from "@/lib/api/rate-limit";
import { readJsonBody } from "@/lib/api/guard";
import { toErrorResponse } from "@/lib/api/response";
import { actionJson, authenticateStorefrontRequest } from "@/lib/api/storefront";
import { parseCartRequest } from "@/lib/storefront/validation";
import { prepareBundleCart } from "@/services/storefront/cart";

/**
 * Authoritative "add bundle" validation. Returns the cart lines for the
 * storefront's own Ajax Cart API (`/cart/add.js`); it doesn't touch the
 * customer's cart itself and stores nothing.
 */
export async function POST(request: Request) {
  try {
    const shop = await authenticateStorefrontRequest(request);
    enforceRateLimit(cartLimiter, `${shop.id}:${clientKey(request)}`);
    const body = parseCartRequest(await readJsonBody(request));
    return actionJson(await prepareBundleCart(shop, body.bundleId, body.selection));
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
