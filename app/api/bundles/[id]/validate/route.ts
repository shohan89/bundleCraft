import { authenticateApiRequest, parseBundleId } from "@/lib/api/guard";
import { ok, toErrorResponse } from "@/lib/api/response";
import { validateBundle } from "@/services/bundles/validate";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const shop = await authenticateApiRequest(request);
    const id = parseBundleId((await params).id);
    return ok(await validateBundle(shop.id, id));
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
