import { ApiError } from "@/lib/api/errors";
import { toErrorResponse } from "@/lib/api/response";
import { authenticateStorefrontRequest, publicJson } from "@/lib/api/storefront";
import { parseStorefrontQuery } from "@/lib/storefront/validation";
import { getStorefrontBundles, getStorefrontListing } from "@/services/storefront/bundles";

/**
 * Public, App-Proxy-signed. Returns only ACTIVE bundles of the calling
 * shop, in the storefront-safe shape (see lib/storefront/types.ts).
 */
export async function GET(request: Request) {
  try {
    const shop = await authenticateStorefrontRequest(request);
    const query = parseStorefrontQuery(new URL(request.url).searchParams);
    if (query.view === "listing") {
      return publicJson({ bundles: await getStorefrontListing(shop) });
    }
    const bundles = await getStorefrontBundles(shop, query);

    // Asking for one specific bundle that isn't live is "unavailable",
    // whether it's a draft, inactive, deleted, or another shop's.
    if (query.bundleId && bundles.length === 0) {
      throw new ApiError("BUNDLE_NOT_FOUND", "This bundle is currently unavailable.", 404);
    }
    return publicJson({ bundles });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
