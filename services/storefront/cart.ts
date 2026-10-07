import { ApiError } from "@/lib/api/errors";
import { buildCartLines } from "@/lib/storefront/cart";
import { resolveSelection, toSelectionBundle } from "@/lib/storefront/selection";
import type { BundleSelectionItem, CartLineItem } from "@/lib/storefront/types";
import { getStorefrontBundles, type StorefrontShop } from "./bundles";

export const unavailable = () =>
  new ApiError("BUNDLE_NOT_FOUND", "This bundle is currently unavailable.", 404);

/**
 * The authoritative "add bundle" check. Re-loads the ACTIVE bundle for this
 * shop (a customer can't add a draft/inactive/other-shop bundle), runs the
 * same selection rules the widget uses, and returns cart lines for the
 * storefront's own Ajax Cart API. No cart state is kept on our side.
 */
export async function prepareBundleCart(
  shop: StorefrontShop,
  bundleId: string,
  selection: BundleSelectionItem[],
): Promise<{ items: CartLineItem[]; bundleInstanceId: string }> {
  const [bundle] = await getStorefrontBundles(shop, { bundleId });
  if (!bundle) throw unavailable();

  const chosen = new Map(bundle.products.map((product) => [product.key, product]));
  for (const item of selection) {
    const product = chosen.get(item.key);
    const variant = product?.variants.find((candidate) => candidate.id === item.variantId);
    if (variant && !variant.available) {
      throw new ApiError("VALIDATION_ERROR", "Sorry, one of those items is out of stock.", 422, [
        { field: "selection", code: "INVALID_VARIANT", message: "Item out of stock." },
      ]);
    }
  }

  const resolved = resolveSelection(toSelectionBundle(bundle), selection);
  if (!resolved.ok) {
    throw new ApiError("VALIDATION_ERROR", resolved.issue.message, 422, [
      { field: "selection", code: resolved.issue.code, message: resolved.issue.message },
    ]);
  }

  const bundleInstanceId = crypto.randomUUID();
  return {
    items: buildCartLines(
      { id: bundle.id, name: bundle.name, type: bundle.type },
      resolved.lines,
      bundleInstanceId,
    ),
    bundleInstanceId,
  };
}
