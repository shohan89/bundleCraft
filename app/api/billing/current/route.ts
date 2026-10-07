import { authenticateApiRequest } from "@/lib/api/guard";
import { ok, toErrorResponse } from "@/lib/api/response";
import { getBillingState } from "@/services/billing/subscriptions";

/** The authenticated shop's plan, subscription status, limits and usage. */
export async function GET(request: Request) {
  try {
    const shop = await authenticateApiRequest(request);
    return ok(await getBillingState(shop.id));
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
