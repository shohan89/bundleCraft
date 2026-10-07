import { authenticateApiRequest } from "@/lib/api/guard";
import { ok, toErrorResponse } from "@/lib/api/response";
import { parseProductQuery } from "@/lib/products/validation";
import { listProducts } from "@/services/products/queries";

/**
 * The authenticated shop's synced products, filtered and paginated. The shop is the
 * session's shop; a shopId parameter is rejected as an unknown filter.
 */
export async function GET(request: Request) {
  try {
    const shop = await authenticateApiRequest(request);
    const query = parseProductQuery(new URL(request.url).searchParams);
    return ok(await listProducts(shop.id, query));
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
