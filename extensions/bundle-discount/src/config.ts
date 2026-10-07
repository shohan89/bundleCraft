/**
 * The bundle configuration the Function trusts. It is written by the
 * BundleCraft server (lib/discounts/config.ts) into an app-owned metafield
 * on the discount, so only this app can set it. Cart line properties are
 * customer-editable and are never used for anything except *finding* the
 * bundle instance a line claims to belong to; every rule and every number
 * comes from here. The shape is re-validated on every run.
 */
export const CONFIG_VERSION = 1;

export type BundleType = "fixed" | "quantity" | "mix_match";
export type DiscountType = "percentage" | "fixed_amount";

export interface BundleRow {
  /** Numeric Shopify ids (no gid prefix). */
  productId: string;
  variantId: string;
  quantity: number;
}

export interface BundleConfig {
  version: typeof CONFIG_VERSION;
  bundleId: string;
  name: string;
  type: BundleType;
  requiredQuantity: number | null;
  discount: { type: DiscountType; value: number };
  /** Currency the merchant's fixed amount is expressed in (the shop currency). */
  currencyCode: string;
  rows: BundleRow[];
}

const MAX_QUANTITY = 100;
const MAX_ROWS = 50;
const NUMERIC_ID = /^\d{1,20}$/;
const BUNDLE_TYPES: readonly string[] = ["fixed", "quantity", "mix_match"];

/** Shopify ids arrive as gids in Function input and may be bare numbers in config. */
export function toNumericId(id: string): string {
  const match = /(\d+)$/.exec(id);
  return match ? match[1] : id;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isQuantity = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_QUANTITY;

/** Returns null for anything that isn't a complete, valid v1 config: the Function then applies no discount. */
export function parseConfig(raw: string | null | undefined): BundleConfig | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.version !== CONFIG_VERSION) return null;

  const { bundleId, name, type, requiredQuantity, discount, currencyCode, rows } = value;
  if (typeof bundleId !== "string" || bundleId.length === 0 || bundleId.length > 64) return null;
  if (typeof name !== "string") return null;
  if (typeof type !== "string" || !BUNDLE_TYPES.includes(type)) return null;
  if (typeof currencyCode !== "string" || !/^[A-Z]{3}$/.test(currencyCode)) return null;

  if (!isRecord(discount) || typeof discount.value !== "number" || !isFinite(discount.value)) {
    return null;
  }
  if (discount.type === "percentage") {
    if (discount.value <= 0 || discount.value > 100) return null;
  } else if (discount.type === "fixed_amount") {
    if (discount.value <= 0) return null;
  } else {
    return null;
  }

  if (type === "fixed") {
    if (requiredQuantity !== null) return null;
  } else if (!isQuantity(requiredQuantity)) {
    return null;
  }

  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROWS) return null;
  const parsedRows: BundleRow[] = [];
  for (const row of rows) {
    if (
      !isRecord(row) ||
      typeof row.productId !== "string" ||
      typeof row.variantId !== "string" ||
      !NUMERIC_ID.test(row.productId) ||
      !NUMERIC_ID.test(row.variantId) ||
      !isQuantity(row.quantity)
    ) {
      return null;
    }
    parsedRows.push({
      productId: row.productId,
      variantId: row.variantId,
      quantity: row.quantity,
    });
  }

  return {
    version: CONFIG_VERSION,
    bundleId,
    name,
    type: type as BundleType,
    requiredQuantity: type === "fixed" ? null : (requiredQuantity as number),
    discount: { type: discount.type, value: discount.value },
    currencyCode,
    rows: parsedRows,
  };
}
