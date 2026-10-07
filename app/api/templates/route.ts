import { authenticateApiRequest } from "@/lib/api/guard";
import { ok, toErrorResponse } from "@/lib/api/response";
import { parseTemplateQuery } from "@/lib/templates/validation";
import { listTemplates } from "@/services/templates/templates";

/**
 * The active template catalog (application-owned, the same for every shop). Read-only: this
 * file exports GET only, so every other method is a 405, and the catalog can only change
 * through the seed. A session is still required: it is merchant-dashboard data.
 */
export async function GET(request: Request) {
  try {
    await authenticateApiRequest(request);
    const query = parseTemplateQuery(new URL(request.url).searchParams);
    return ok({ templates: await listTemplates(query) });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
