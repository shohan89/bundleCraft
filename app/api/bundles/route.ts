import { authenticateApiRequest, readJsonBody } from "@/lib/api/guard";
import { ok, toErrorResponse } from "@/lib/api/response";
import { parseBundleListQuery, parseCreateBundleBody } from "@/lib/bundles/validation";
import { createBundle } from "@/services/bundles/create";
import { countBundles, listBundles } from "@/services/bundles/list";

export async function GET(request: Request) {
  try {
    const shop = await authenticateApiRequest(request);
    const { page, limit } = parseBundleListQuery(new URL(request.url).searchParams);
    // Page and total are read at the same time; the response size is bounded by `limit`.
    const [bundles, total] = await Promise.all([
      listBundles(shop.id, { page, limit }),
      countBundles(shop.id),
    ]);
    return ok({ bundles, page, limit, total });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}

export async function POST(request: Request) {
  try {
    const shop = await authenticateApiRequest(request);
    const input = parseCreateBundleBody(await readJsonBody(request));
    return ok(
      { bundle: await createBundle(shop.id, input, { verifyCatalog: true, verifyTemplate: true }) },
      201,
    );
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
