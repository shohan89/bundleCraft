import { authenticateApiRequest, parseBundleId } from "@/lib/api/guard";
import { ok, toErrorResponse } from "@/lib/api/response";
import { duplicateBundle } from "@/services/bundles/duplicate";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const shop = await authenticateApiRequest(request);
    const id = parseBundleId((await params).id);
    return ok({ bundle: await duplicateBundle(shop.id, id) }, 201);
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
