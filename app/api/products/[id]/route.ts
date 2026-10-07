import { authenticateApiRequest } from "@/lib/api/guard";
import { ok, toErrorResponse } from "@/lib/api/response";
import { parseProductId } from "@/lib/products/validation";
import { getProduct } from "@/services/products/queries";

/** One of the authenticated shop's products with its variants. Another shop's id is a 404. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const shop = await authenticateApiRequest(request);
    const id = parseProductId((await params).id);
    return ok({ product: await getProduct(shop.id, id) });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
