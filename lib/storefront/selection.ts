/**
 * The customer selection rules for the three bundle types, in one place.
 * The widget runs this for instant feedback; the server runs the very same
 * function as the authoritative check before it hands back cart lines —
 * client-side validation is UX only.
 */
import { MAX_PRODUCT_QUANTITY } from "@/lib/bundles/rules";
import type { BundleType } from "@/lib/bundles/types";
import type { BundleSelectionItem, StorefrontBundle } from "./types";

export interface SelectionRow {
  key: string;
  /** Units this row contributes per selection (fixed and mix & match). */
  quantity: number;
  /** The configured variant plus any other variants of the same product. */
  allowedVariantIds: string[];
}

export interface SelectionBundle {
  type: BundleType;
  requiredQuantity: number | null;
  rows: SelectionRow[];
}

export interface SelectionIssue {
  code:
    | "SELECTION_INCOMPLETE"
    | "SELECTION_TOO_MANY"
    | "INVALID_SELECTION"
    | "INVALID_VARIANT"
    | "INVALID_QUANTITY"
    | "BUNDLE_UNAVAILABLE";
  /** Customer-friendly; never internal detail. */
  message: string;
}

export interface ResolvedLine {
  key: string;
  variantId: string;
  quantity: number;
}

export type SelectionResult =
  { ok: true; lines: ResolvedLine[] } | { ok: false; issue: SelectionIssue };

function fail(code: SelectionIssue["code"], message: string): SelectionResult {
  return { ok: false, issue: { code, message } };
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export function resolveSelection(
  bundle: SelectionBundle,
  selection: BundleSelectionItem[],
): SelectionResult {
  if (bundle.rows.length === 0) {
    return fail("BUNDLE_UNAVAILABLE", "This bundle is currently unavailable.");
  }

  const rowsByKey = new Map(bundle.rows.map((row) => [row.key, row]));
  const seen = new Set<string>();

  for (const item of selection) {
    const row = rowsByKey.get(item.key);
    if (!row)
      return fail("INVALID_SELECTION", "One of the selected items isn't part of this bundle.");
    if (seen.has(item.key))
      return fail("INVALID_SELECTION", "An item was selected more than once.");
    seen.add(item.key);

    if (!row.allowedVariantIds.includes(item.variantId)) {
      return fail("INVALID_VARIANT", "One of the selected options isn't available.");
    }
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > MAX_PRODUCT_QUANTITY
    ) {
      return fail("INVALID_QUANTITY", "One of the selected quantities isn't valid.");
    }
  }

  if (bundle.type === "fixed") {
    if (selection.length !== bundle.rows.length) {
      return fail("SELECTION_INCOMPLETE", "This bundle includes all of its products.");
    }
    // Quantities come from the bundle, not the customer.
    return {
      ok: true,
      lines: selection.map((item) => ({
        key: item.key,
        variantId: item.variantId,
        quantity: rowsByKey.get(item.key)?.quantity ?? item.quantity,
      })),
    };
  }

  const required = bundle.requiredQuantity;
  if (required === null || required < 1) {
    return fail("BUNDLE_UNAVAILABLE", "This bundle is currently unavailable.");
  }

  if (bundle.type === "quantity") {
    const total = selection.reduce((sum, item) => sum + item.quantity, 0);
    if (total < required) {
      return fail("SELECTION_INCOMPLETE", `Choose ${plural(required - total, "more item")}.`);
    }
    if (total > required) {
      return fail("SELECTION_TOO_MANY", `Choose exactly ${plural(required, "item")}.`);
    }
    return {
      ok: true,
      lines: selection.map(({ key, variantId, quantity }) => ({ key, variantId, quantity })),
    };
  }

  // mix_match: distinct products (duplicates already rejected), fixed unit per product.
  if (selection.length < required) {
    return fail(
      "SELECTION_INCOMPLETE",
      `Choose ${plural(required - selection.length, "more item")}.`,
    );
  }
  if (selection.length > required) {
    return fail("SELECTION_TOO_MANY", `Choose exactly ${plural(required, "item")}.`);
  }
  for (const item of selection) {
    if (item.quantity !== rowsByKey.get(item.key)?.quantity) {
      return fail("INVALID_QUANTITY", "One of the selected quantities isn't valid.");
    }
  }
  return {
    ok: true,
    lines: selection.map(({ key, variantId, quantity }) => ({ key, variantId, quantity })),
  };
}

/**
 * Which variants a customer may pick for each product row, as far as live
 * data tells us. The merchant-configured variant is always allowed.
 * Sibling variants are allowed only when live data confirmed they belong
 * to this product and are in stock; a variant we couldn't verify is never
 * accepted. Used identically by the widget (UX) and the server (authority).
 */
export function toSelectionBundle(bundle: StorefrontBundle): SelectionBundle {
  return {
    type: bundle.type,
    requiredQuantity: bundle.requiredQuantity,
    rows: bundle.products.map((product) => ({
      key: product.key,
      quantity: product.quantity,
      allowedVariantIds: [
        product.variantId,
        ...product.variants
          .filter((variant) => variant.available && variant.id !== product.variantId)
          .map((variant) => variant.id),
      ],
    })),
  };
}
