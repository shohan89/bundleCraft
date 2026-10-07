/**
 * Analytics shapes shared by the API, the services and the dashboard.
 * Dependency-free (no Prisma, no server code) so client components can
 * import them.
 */
export const ANALYTICS_EVENT_TYPES = ["bundle_view", "bundle_add", "bundle_purchase"] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

/** Events a storefront browser may report. Purchases are never client-reported. */
export const CLIENT_EVENT_TYPES = ["bundle_view", "bundle_add"] as const;
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];

/** An amount in one currency. Currencies are never converted or summed together. */
export interface Money {
  currency: string;
  amount: number;
}

export interface AnalyticsFilters {
  /** Inclusive lower bound (UTC). */
  from: Date | null;
  /** Inclusive upper bound (UTC). */
  to: Date | null;
  bundleId: string | null;
}

export interface MetricTotals {
  views: number;
  adds: number;
  purchases: number;
  /** One entry per currency; empty when there are no purchases. */
  revenue: Money[];
  /** purchases / views * 100, rounded to 2 decimals. 0 when there are no views. */
  conversionRate: number;
}

export interface BundleAnalytics extends MetricTotals {
  bundleId: string;
  title: string;
}

export interface AnalyticsOverview extends MetricTotals {
  range: { from: string | null; to: string | null };
  bundleId: string | null;
  /** Per-bundle breakdown, best performing first. Empty when filtered to one bundle. */
  byBundle: BundleAnalytics[];
}
