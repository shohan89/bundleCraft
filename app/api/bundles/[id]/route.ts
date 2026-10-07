import { authenticateApiRequest, parseBundleId, readJsonBody } from "@/lib/api/guard";
import { ok, toErrorResponse } from "@/lib/api/response";
import { parseUpdateBundleBody } from "@/lib/bundles/validation";
import { deleteBundle } from "@/services/bundles/delete";
import { getBundle } from "@/services/bundles/get";
import { updateBundle } from "@/services/bundles/update";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const shop = await authenticateApiRequest(request);
    const id = parseBundleId((await params).id);
    return ok({ bundle: await getBundle(shop.id, id) });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const shop = await authenticateApiRequest(request);
    const id = parseBundleId((await params).id);
    const patch = parseUpdateBundleBody(await readJsonBody(request));
    return ok({
      bundle: await updateBundle(shop.id, id, patch, { verifyCatalog: true, verifyTemplate: true }),
    });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}

// docs/06-API_SPECIFICATION.md documents PUT; the update is a partial
// update either way, so both verbs share one handler.
export const PUT = PATCH;

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const shop = await authenticateApiRequest(request);
    const id = parseBundleId((await params).id);
    await deleteBundle(shop.id, id);
    return ok({ deleted: true });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
