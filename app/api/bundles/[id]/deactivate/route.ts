import { authenticateApiRequest, parseBundleId } from "@/lib/api/guard";
import { ok, toErrorResponse } from "@/lib/api/response";
import { deactivateBundle } from "@/services/bundles/publish";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const shop = await authenticateApiRequest(request);
    const id = parseBundleId((await params).id);
    return ok({ bundle: await deactivateBundle(shop.id, id) });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
