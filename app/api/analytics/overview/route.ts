import { authenticateApiRequest } from "@/lib/api/guard";
import { ok, toErrorResponse } from "@/lib/api/response";
import { parseAnalyticsFilters } from "@/lib/analytics/validation";
import { getAnalyticsOverview } from "@/services/analytics/queries";
import { assertFeatureAccess } from "@/services/billing/access";

/**
 * Store totals, optionally narrowed by ?startDate=&endDate=&bundleId=. The
 * shop is the authenticated session's shop; a `shopId` parameter is not
 * read at all.
 */
export async function GET(request: Request) {
  try {
    const shop = await authenticateApiRequest(request);
    await assertFeatureAccess(shop.id, "analytics"); // plan gate (ACTION-009): reading only, collection is never gated
    const filters = parseAnalyticsFilters(new URL(request.url).searchParams);
    return ok(await getAnalyticsOverview(shop.id, filters));
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
