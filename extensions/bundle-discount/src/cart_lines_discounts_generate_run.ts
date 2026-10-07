import { DiscountClass, ProductDiscountSelectionStrategy } from "../generated/api";
import type { CartInput, CartLinesDiscountsGenerateRunResult } from "../generated/api";
import { groupBundleInstances, type InputLine } from "./bundle";
import { parseConfig } from "./config";
import { buildCandidate, type ProductCandidate } from "./discount";
import { validateInstance } from "./validation";

const NO_DISCOUNT: CartLinesDiscountsGenerateRunResult = { operations: [] };

/**
 * Discounts every *complete* BundleCraft bundle in the cart. Shopify runs
 * this once per BundleCraft discount, each carrying its own bundle's
 * configuration. Nothing here fails loudly: an invalid or missing
 * configuration, a wrong discount class, or an incomplete bundle simply
 * yields no discount, so a problem can never block checkout.
 */
export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) return NO_DISCOUNT;
  if (input.cart.lines.length === 0) return NO_DISCOUNT;

  const config = parseConfig(input.discount.configuration?.value);
  if (!config) return NO_DISCOUNT;

  const currency = input.cart.cost.subtotalAmount.currencyCode;
  const candidates: ProductCandidate[] = [];
  for (const instance of groupBundleInstances(input.cart.lines as InputLine[], config.bundleId)) {
    if (!validateInstance(config, instance).ok) continue;
    const candidate = buildCandidate(config, instance, currency);
    if (candidate) candidates.push(candidate);
  }
  if (candidates.length === 0) return NO_DISCOUNT;

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          // Every complete instance gets its discount; instances are independent.
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
