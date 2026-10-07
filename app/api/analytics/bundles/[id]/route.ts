import { authenticateApiRequest, parseBundleId } from "@/lib/api/guard";
import { ok, toErrorResponse } from "@/lib/api/response";
import { parseAnalyticsFilters } from "@/lib/analytics/validation";
import { getBundleAnalytics } from "@/services/analytics/queries";
import { assertFeatureAccess } from "@/services/billing/access";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const shop = await authenticateApiRequest(request);
    await assertFeatureAccess(shop.id, "analytics"); // plan gate (ACTION-009): reading only, collection is never gated
    const id = parseBundleId((await params).id);
    const { from, to } = parseAnalyticsFilters(new URL(request.url).searchParams);
    return ok({ analytics: await getBundleAnalytics(shop.id, id, { from, to }) });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
