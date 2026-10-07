import type { BundleInstance, BundleLine } from "./bundle";
import type { BundleConfig, BundleRow } from "./config";

export type InstanceIssue =
  | "UNKNOWN_PRODUCT"
  | "DUPLICATE_PRODUCT"
  | "WRONG_QUANTITY"
  | "INCOMPLETE"
  | "TOO_MANY";

export type InstanceCheck = { ok: true } | { ok: false; reason: InstanceIssue };

/**
 * Pairs each line with one distinct configured row: the exact variant if
 * a row lists it, otherwise another variant of a row's product (the widget
 * lets customers pick sibling variants). Reports why a line can't be paired.
 */
function matchRows(
  config: BundleConfig,
  lines: BundleLine[],
): { pairs: [BundleLine, BundleRow][] } | { reason: InstanceIssue } {
  const free = new Set(config.rows);
  const pairs: [BundleLine, BundleRow][] = [];
  const known = new Set(config.rows.map((row) => row.productId));

  // Exact variants first so a sibling-variant line can't steal another row's exact match.
  const rest: BundleLine[] = [];
  for (const line of lines) {
    const exact = [...free].find((row) => row.variantId === line.variantId);
    if (exact) {
      free.delete(exact);
      pairs.push([line, exact]);
    } else {
      rest.push(line);
    }
  }
  for (const line of rest) {
    if (!known.has(line.productId)) return { reason: "UNKNOWN_PRODUCT" };
    const sibling = [...free].find((row) => row.productId === line.productId);
    if (!sibling) return { reason: "DUPLICATE_PRODUCT" };
    free.delete(sibling);
    pairs.push([line, sibling]);
  }
  return { pairs };
}

/**
 * Mirrors lib/storefront/selection.ts (the server-side authority for what
 * the widget may add) against what is actually in the cart. Pure and
 * deterministic; everything except `instance` comes from the trusted config.
 */
export function validateInstance(config: BundleConfig, instance: BundleInstance): InstanceCheck {
  const matched = matchRows(config, instance.lines);
  if ("reason" in matched) return { ok: false, reason: matched.reason };
  const { pairs } = matched;
  const quantitiesMatch = pairs.every(([line, row]) => line.quantity === row.quantity);

  if (config.type === "fixed") {
    // Every product, once, at the bundle's own quantity.
    if (pairs.length < config.rows.length) return { ok: false, reason: "INCOMPLETE" };
    return quantitiesMatch ? { ok: true } : { ok: false, reason: "WRONG_QUANTITY" };
  }

  const required = config.requiredQuantity ?? 0;

  if (config.type === "quantity") {
    const total = pairs.reduce((sum, [line]) => sum + line.quantity, 0);
    if (total < required) return { ok: false, reason: "INCOMPLETE" };
    if (total > required) return { ok: false, reason: "TOO_MANY" };
    return { ok: true };
  }

  // mix_match: exactly N distinct products, each at the bundle's quantity for it.
  if (pairs.length < required) return { ok: false, reason: "INCOMPLETE" };
  if (pairs.length > required) return { ok: false, reason: "TOO_MANY" };
  return quantitiesMatch ? { ok: true } : { ok: false, reason: "WRONG_QUANTITY" };
}
