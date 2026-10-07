import type { BundleType } from "@/lib/bundles/types";
import type { ResolvedLine } from "./selection";
import type { CartLineItem } from "./types";

export interface BundleCartMeta {
  id: string;
  name: string;
  type: BundleType;
}

/**
 * Turns validated selection lines into Ajax Cart lines. The `_`-prefixed
 * line item properties are Shopify's convention for properties hidden from
 * the customer at checkout, and hold only bundle identification — never
 * anything about the merchant.
 */
export function buildCartLines(
  bundle: BundleCartMeta,
  lines: ResolvedLine[],
  bundleInstanceId: string,
): CartLineItem[] {
  return lines.map((line) => {
    const id = Number(line.variantId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new RangeError("Variant id is not a valid Shopify variant id.");
    }
    return {
      id,
      quantity: line.quantity,
      properties: {
        _bundle_id: bundle.id,
        _bundle_name: bundle.name,
        _bundle_type: bundle.type,
        _bundle_instance_id: bundleInstanceId,
      },
    };
  });
}
