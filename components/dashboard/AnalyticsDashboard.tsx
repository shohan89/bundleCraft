"use client";

import { BarChart3, DollarSign, Eye, ShoppingBag, ShoppingCart, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/api/client";
import { formatConversion, formatRevenue, hasActivity } from "@/lib/analytics/metrics";
import type { AnalyticsOverview } from "@/lib/analytics/types";

export const RANGES = [
  { value: "all", label: "All time" },
  { value: "30d", label: "Last 30 days" },
  { value: "7d", label: "Last 7 days" },
  { value: "today", label: "Today" },
] as const;
export type RangeValue = (typeof RANGES)[number]["value"];

const DAYS: Record<Exclude<RangeValue, "all">, number> = { today: 1, "7d": 7, "30d": 30 };

/** Query string for the overview API. Dates are UTC days, matching how the server reads them. */
export function buildOverviewQuery(range: RangeValue, bundleId: string, now = new Date()): string {
  const params = new URLSearchParams();
  if (range !== "all") {
    const start = new Date(now.getTime() - (DAYS[range] - 1) * 86_400_000);
    params.set("startDate", start.toISOString().slice(0, 10));
    params.set("endDate", now.toISOString().slice(0, 10));
  }
  if (bundleId) params.set("bundleId", bundleId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AnalyticsOverview };

interface AnalyticsDashboardProps {
  bundles: { id: string; title: string }[];
}

const selectClass =
  "border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs";

function LoadingSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading analytics">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

export function AnalyticsDashboard({ bundles }: AnalyticsDashboardProps) {
  const [range, setRange] = useState<RangeValue>("all");
  const [bundleId, setBundleId] = useState("");
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    const result = await apiRequest<AnalyticsOverview>(
      "GET",
      `/api/analytics/overview${buildOverviewQuery(range, bundleId)}`,
    );
    return result;
  }, [range, bundleId]);

  useEffect(() => {
    let cancelled = false;
    void load().then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "ready", data: result.data }
          : { status: "error", message: result.error.message },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [load, attempt]);

  const filtered = range !== "all" || bundleId !== "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          Period
          <select
            className={selectClass}
            value={range}
            onChange={(event) => {
              setState({ status: "loading" });
              setRange(event.target.value as RangeValue);
            }}
          >
            {RANGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          Bundle
          <select
            className={selectClass}
            value={bundleId}
            onChange={(event) => {
              setState({ status: "loading" });
              setBundleId(event.target.value);
            }}
          >
            <option value="">All bundles</option>
            {bundles.map((bundle) => (
              <option key={bundle.id} value={bundle.id}>
                {bundle.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.status === "loading" ? <LoadingSkeleton /> : null}

      {state.status === "error" ? (
        <ErrorState
          title="Analytics could not load"
          message={state.message}
          onRetry={() => {
            setState({ status: "loading" });
            setAttempt((count) => count + 1);
          }}
        />
      ) : null}

      {state.status === "ready" && !hasActivity(state.data) ? (
        <EmptyState
          icon={BarChart3}
          title={filtered ? "No activity for these filters" : "No bundle activity yet"}
          description={
            filtered
              ? "Try a longer period or a different bundle."
              : "Create and publish a bundle to start collecting performance data."
          }
        />
      ) : null}

      {state.status === "ready" && hasActivity(state.data) ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label="Bundle views" value={String(state.data.views)} icon={Eye} />
            <MetricCard label="Bundle adds" value={String(state.data.adds)} icon={ShoppingBag} />
            <MetricCard
              label="Bundle purchases"
              value={String(state.data.purchases)}
              icon={ShoppingCart}
            />
            <MetricCard
              label="Revenue generated"
              value={formatRevenue(state.data.revenue)}
              icon={DollarSign}
            />
            <MetricCard
              label="Conversion rate"
              value={formatConversion(state.data.views, state.data.conversionRate)}
              icon={TrendingUp}
              helpText="Purchases per bundle view"
            />
          </div>

          {state.data.byBundle.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-foreground text-sm font-semibold">By bundle</h2>
              <div className="border-border overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bundle</TableHead>
                      <TableHead>Views</TableHead>
                      <TableHead>Adds</TableHead>
                      <TableHead>Purchases</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Conversion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {state.data.byBundle.map((row) => (
                      <TableRow key={row.bundleId}>
                        <TableCell className="font-medium">{row.title}</TableCell>
                        <TableCell className="tabular-nums">{row.views}</TableCell>
                        <TableCell className="tabular-nums">{row.adds}</TableCell>
                        <TableCell className="tabular-nums">{row.purchases}</TableCell>
                        <TableCell className="tabular-nums">
                          {formatRevenue(row.revenue) ?? "—"}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatConversion(row.views, row.conversionRate) ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
