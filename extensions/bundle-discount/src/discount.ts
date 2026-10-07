import type { BundleInstance } from "./bundle";
import type { BundleConfig } from "./config";

export interface ProductCandidate {
  message: string;
  targets: { cartLine: { id: string } }[];
  value:
    | { percentage: { value: string } }
    | { fixedAmount: { amount: string; appliesToEachItem: false } };
}

/**
 * One discount candidate for one complete bundle instance, or null when
 * there is nothing to discount. Percentage discounts apply to every line
 * of the instance. A fixed amount is spread across the instance's lines by
 * Shopify (appliesToEachItem: false) and is capped at the instance
 * subtotal so a bundle can never go below zero. It is only applied when
 * the cart is in the currency the merchant set it in: a multi-currency cart
 * would otherwise read "10.00" as 10 of a different currency.
 */
export function buildCandidate(
  config: BundleConfig,
  instance: BundleInstance,
  cartCurrencyCode: string,
): ProductCandidate | null {
  const targets = instance.lines.map((line) => ({ cartLine: { id: line.id } }));
  const message = config.name ? `Bundle: ${config.name}` : "Bundle discount";

  if (config.discount.type === "percentage") {
    return { message, targets, value: { percentage: { value: String(config.discount.value) } } };
  }

  if (cartCurrencyCode !== config.currencyCode) return null;
  const subtotal = instance.lines.reduce((sum, line) => sum + line.subtotalCents, 0);
  const cents = Math.min(Math.round(config.discount.value * 100), subtotal);
  if (cents <= 0) return null;
  return {
    message,
    targets,
    value: { fixedAmount: { amount: (cents / 100).toFixed(2), appliesToEachItem: false } },
  };
}
