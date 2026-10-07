import { authenticateApiRequest, parseBundleId, readJsonBody } from "@/lib/api/guard";
import { ok, toErrorResponse } from "@/lib/api/response";
import {
  getBundleCustomization,
  saveBundleCustomization,
} from "@/services/customization/customization";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * The bundle's storefront customization (see lib/customization). The shop is the session's shop;
 * the body is validated strictly and can only ever contain predefined options and #RRGGBB colours.
 */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const shop = await authenticateApiRequest(request);
    const id = parseBundleId((await params).id);
    return ok({ customization: await getBundleCustomization(shop.id, id) });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}

/** Partial update: only the fields sent change. */
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const shop = await authenticateApiRequest(request);
    const id = parseBundleId((await params).id);
    const body = await readJsonBody(request);
    return ok({ customization: await saveBundleCustomization(shop.id, id, body, "merge") });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}

/** Replace: the body is the whole customization; anything left out uses the defaults (`{}` resets). */
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const shop = await authenticateApiRequest(request);
    const id = parseBundleId((await params).id);
    const body = await readJsonBody(request);
    return ok({ customization: await saveBundleCustomization(shop.id, id, body, "replace") });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
