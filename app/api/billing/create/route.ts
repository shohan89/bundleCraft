import { authenticateApiRequest, readJsonBody } from "@/lib/api/guard";
import { ok, toErrorResponse } from "@/lib/api/response";
import { parseCreateBillingBody } from "@/lib/billing/validation";
import { createSubscription } from "@/services/billing/create";

/**
 * Start a paid plan. The body carries only the plan name; the shop comes from
 * the session and the price from the server's plan config.
 */
export async function POST(request: Request) {
  try {
    const shop = await authenticateApiRequest(request);
    const { plan } = parseCreateBillingBody(await readJsonBody(request));
    return ok(await createSubscription({ id: shop.id, shopDomain: shop.shopDomain }, plan));
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
