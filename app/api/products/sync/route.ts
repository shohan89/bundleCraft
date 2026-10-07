import { authenticateApiRequest } from "@/lib/api/guard";
import { ok, toErrorResponse } from "@/lib/api/response";
import type { CatalogSyncResponse } from "@/lib/products/types";
import { getCatalogStatus } from "@/services/products/queries";
import { syncCatalog } from "@/services/products/sync";

/**
 * Runs (or resumes) the authenticated shop's catalog sync for up to about 20 seconds.
 * The response says whether it finished; the dashboard calls again until it does. No body
 * is read: there is nothing for a client to choose, and the shop is the session's shop.
 */
export async function POST(request: Request) {
  try {
    const shop = await authenticateApiRequest(request);
    const result = await syncCatalog(shop.id);
    const body: CatalogSyncResponse = {
      outcome: result.outcome,
      products: result.products,
      variants: result.variants,
      skipped: result.skipped,
      markedDeleted: result.markedDeleted,
      catalog: await getCatalogStatus(shop.id),
    };
    return ok(body);
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
