import { calculateDiscountedPrice, validateDiscount } from "@/lib/bundles/rules";
import type { DiscountType } from "@/lib/bundles/types";

export interface BundleTotals {
  subtotal: number;
  total: number;
  savings: number;
}

/**
 * Display-only price preview using the Bundle Engine's own discount math.
 * Nothing here charges anything: applying the discount at checkout is the
 * Discount Function's job (ACTION-007). Returns null when any price is
 * unknown, so the widget shows no figure rather than a guess.
 */
export function computeTotals(
  lines: { price: string | null; quantity: number }[],
  discount: { type: DiscountType; value: number },
): BundleTotals | null {
  if (lines.length === 0 || validateDiscount(discount.type, discount.value) !== null) return null;

  let subtotal = 0;
  for (const line of lines) {
    const price = line.price === null ? Number.NaN : Number(line.price);
    if (!Number.isFinite(price)) return null;
    subtotal += price * line.quantity;
  }
  subtotal = Math.round(subtotal * 100) / 100;

  const total = calculateDiscountedPrice(subtotal, discount.type, discount.value);
  return { subtotal, total, savings: Math.round((subtotal - total) * 100) / 100 };
}
