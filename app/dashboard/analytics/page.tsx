import { BarChart3, DollarSign, Eye, ShoppingCart, TrendingUp } from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { requireAuthenticatedShop } from "@/lib/dashboard/auth";
import { getAnalyticsSummary } from "@/services/dashboard/analytics";

function formatCurrency(value: number | null): string | null {
  if (value === null) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatPercent(value: number | null): string | null {
  if (value === null) return null;
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(
    value,
  );
}

export default async function AnalyticsPage() {
  const shop = await requireAuthenticatedShop();
  const summary = await getAnalyticsSummary(shop.id);

  const hasAnyData = summary.orders > 0 || summary.views > 0 || summary.adds > 0;

  return (
    <div className="space-y-8">
      <PageHeader title="Analytics" description="Track how your bundles are performing." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Revenue" value={formatCurrency(summary.revenue)} icon={DollarSign} />
        <MetricCard label="Orders" value={String(summary.orders)} icon={ShoppingCart} />
        <MetricCard label="Views" value={String(summary.views)} icon={Eye} />
        <MetricCard label="Adds" value={String(summary.adds)} icon={BarChart3} />
        <MetricCard
          label="Conversion rate"
          value={formatPercent(summary.conversionRate)}
          icon={TrendingUp}
        />
      </div>

      {!hasAnyData ? (
        <EmptyState
          icon={BarChart3}
          title="No analytics data yet"
          description="Once your bundles start getting views and purchases, performance data will appear here automatically."
        />
      ) : null}
    </div>
  );
}
