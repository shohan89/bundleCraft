import { authenticateApiRequest } from "@/lib/api/guard";
import { ok, toErrorResponse } from "@/lib/api/response";
import { cancelSubscription } from "@/services/billing/cancel";

/** Cancel the authenticated shop's own paid subscription. Takes no body: there is nothing to choose. */
export async function POST(request: Request) {
  try {
    const shop = await authenticateApiRequest(request);
    return ok(await cancelSubscription(shop.id));
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
