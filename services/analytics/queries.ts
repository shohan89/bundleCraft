import { toTotals } from "@/lib/analytics/metrics";
import type {
  AnalyticsEventType,
  AnalyticsFilters,
  AnalyticsOverview,
  BundleAnalytics,
  MetricTotals,
  Money,
} from "@/lib/analytics/types";
import { bundleNotFound } from "@/lib/bundles/errors";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Cap on the per-bundle breakdown so a huge catalogue can't make one response unbounded. */
const MAX_BUNDLE_ROWS = 50;

export const NO_FILTERS: AnalyticsFilters = { from: null, to: null, bundleId: null };

function where(shopId: string, filters: AnalyticsFilters): Prisma.AnalyticsEventWhereInput {
  return {
    // shopId is always present and always comes from the authenticated context.
    shopId,
    ...(filters.bundleId ? { bundleId: filters.bundleId } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };
}

const money = (currency: string | null, amount: { toNumber(): number } | null): Money[] =>
  currency && amount ? [{ currency, amount: amount.toNumber() }] : [];

/**
 * Store-wide (or single-bundle) totals. Aggregation happens in PostgreSQL
 * (COUNT / SUM ... GROUP BY) on the (shop_id, event_type, created_at) and
 * (bundle_id, event_type, created_at) indexes; raw events are never loaded
 * into memory.
 */
export async function getTotals(
  shopId: string,
  filters: AnalyticsFilters = NO_FILTERS,
): Promise<MetricTotals> {
  const base = where(shopId, filters);
  const [counts, revenue] = await Promise.all([
    prisma.analyticsEvent.groupBy({
      by: ["eventType"],
      where: base,
      _count: { _all: true },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["currency"],
      where: { ...base, eventType: "bundle_purchase", currency: { not: null } },
      _sum: { revenue: true },
    }),
  ]);

  return toTotals(
    Object.fromEntries(counts.map((row) => [row.eventType, row._count._all])) as Partial<
      Record<AnalyticsEventType, number>
    >,
    revenue.flatMap((row) => money(row.currency, row._sum.revenue)),
  );
}

async function assertOwnedBundle(shopId: string, bundleId: string): Promise<{ title: string }> {
  // Cross-tenant looks exactly like "no such bundle".
  const bundle = await prisma.bundle.findFirst({
    where: { id: bundleId, shopId },
    select: { title: true },
  });
  if (!bundle) throw bundleNotFound();
  return bundle;
}

/**
 * The store-wide overview in two aggregate statements (and one small title lookup, run at the
 * same time). The per-bundle counts and revenue already contain everything the store totals
 * need, so the totals are summed from them instead of scanning the events again: two scans of
 * the shop's events rather than four, whatever the number of bundles.
 */
async function getStoreOverview(
  shopId: string,
  filters: AnalyticsFilters,
): Promise<{ totals: MetricTotals; byBundle: BundleAnalytics[] }> {
  const base = where(shopId, filters);
  const [counts, revenue, bundles] = await Promise.all([
    prisma.analyticsEvent.groupBy({
      by: ["bundleId", "eventType"],
      where: base,
      _count: { _all: true },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["bundleId", "currency"],
      where: { ...base, eventType: "bundle_purchase", currency: { not: null } },
      _sum: { revenue: true },
    }),
    // Titles for every bundle of the shop (id and title only). Fetching them alongside the
    // aggregates saves a sequential round trip; the list is small and bounded by the shop.
    prisma.bundle.findMany({ where: { shopId }, select: { id: true, title: true } }),
  ]);

  const countsBy = new Map<string, Partial<Record<AnalyticsEventType, number>>>();
  const storeCounts: Partial<Record<AnalyticsEventType, number>> = {};
  for (const row of counts) {
    const perBundle = countsBy.get(row.bundleId) ?? {};
    perBundle[row.eventType] = (perBundle[row.eventType] ?? 0) + row._count._all;
    countsBy.set(row.bundleId, perBundle);
    storeCounts[row.eventType] = (storeCounts[row.eventType] ?? 0) + row._count._all;
  }

  const revenueBy = new Map<string, Money[]>();
  const storeRevenue = new Map<string, number>();
  for (const row of revenue) {
    for (const entry of money(row.currency, row._sum.revenue)) {
      revenueBy.set(row.bundleId, [...(revenueBy.get(row.bundleId) ?? []), entry]);
      storeRevenue.set(entry.currency, (storeRevenue.get(entry.currency) ?? 0) + entry.amount);
    }
  }

  const titleById = new Map(bundles.map((bundle) => [bundle.id, bundle.title]));
  const rows = [...countsBy.keys()].map((bundleId): BundleAnalytics => ({
    bundleId,
    title: titleById.get(bundleId) ?? "Deleted bundle",
    ...toTotals(countsBy.get(bundleId) ?? {}, revenueBy.get(bundleId) ?? []),
  }));
  rows.sort(
    (a, b) =>
      (b.revenue[0]?.amount ?? 0) - (a.revenue[0]?.amount ?? 0) ||
      b.purchases - a.purchases ||
      b.views - a.views ||
      a.title.localeCompare(b.title),
  );

  return {
    totals: toTotals(
      storeCounts,
      [...storeRevenue].map(
        ([currency, amount]): Money => ({ currency, amount: Math.round(amount * 100) / 100 }), // cents
      ),
    ),
    byBundle: rows.slice(0, MAX_BUNDLE_ROWS),
  };
}

/** GET /api/analytics/overview. `filters.bundleId`, when set, must belong to `shopId`. */
export async function getAnalyticsOverview(
  shopId: string,
  filters: AnalyticsFilters = NO_FILTERS,
): Promise<AnalyticsOverview> {
  let totals: MetricTotals;
  let byBundle: BundleAnalytics[] = [];
  if (filters.bundleId) {
    // Ownership check and aggregates in one round: the aggregates are scoped by shop AND
    // bundle, so another shop's id yields nothing, and the check turns that into a 404.
    [, totals] = await Promise.all([
      assertOwnedBundle(shopId, filters.bundleId),
      getTotals(shopId, filters),
    ]);
  } else {
    ({ totals, byBundle } = await getStoreOverview(shopId, filters));
  }

  return {
    ...totals,
    range: { from: filters.from?.toISOString() ?? null, to: filters.to?.toISOString() ?? null },
    bundleId: filters.bundleId,
    byBundle,
  };
}

/** GET /api/analytics/bundles/:id. */
export async function getBundleAnalytics(
  shopId: string,
  bundleId: string,
  filters: Pick<AnalyticsFilters, "from" | "to"> = { from: null, to: null },
): Promise<BundleAnalytics> {
  const { title } = await assertOwnedBundle(shopId, bundleId);
  const totals = await getTotals(shopId, { ...filters, bundleId });
  return { bundleId, title, ...totals };
}
