import type { AnalyticsEventType, MetricTotals, Money } from "./types";

/**
 * Conversion Rate = Bundle Purchases / Bundle Views * 100 (docs/11).
 * Never NaN or Infinity: with no views there is nothing to convert, so 0.
 */
export function conversionRate(views: number, purchases: number): number {
  if (!Number.isFinite(views) || !Number.isFinite(purchases) || views <= 0 || purchases <= 0) {
    return 0;
  }
  return Math.round((purchases / views) * 10_000) / 100;
}

export function toTotals(
  counts: Partial<Record<AnalyticsEventType, number>>,
  revenue: Money[],
): MetricTotals {
  const views = counts.bundle_view ?? 0;
  const adds = counts.bundle_add ?? 0;
  const purchases = counts.bundle_purchase ?? 0;
  return {
    views,
    adds,
    purchases,
    revenue: revenue
      .filter((money) => money.amount !== 0)
      .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency)),
    conversionRate: conversionRate(views, purchases),
  };
}

export const hasActivity = (totals: MetricTotals): boolean =>
  totals.views > 0 || totals.adds > 0 || totals.purchases > 0;

/** "$120.00", or "$120.00 · €40.00" when a shop has sold in more than one currency. */
export function formatRevenue(revenue: Money[], locale = "en-US"): string | null {
  if (revenue.length === 0) return null;
  return revenue
    .map(({ currency, amount }) => {
      try {
        return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
      } catch {
        return `${amount.toFixed(2)} ${currency}`;
      }
    })
    .join(" · ");
}

/** `rate` is already a percentage (10 = 10%). Null when there were no views to convert. */
export function formatConversion(views: number, rate: number, locale = "en-US"): string | null {
  if (views <= 0) return null;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(rate)}%`;
}
