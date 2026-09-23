import { LoadingState, MetricCardsLoadingState } from "@/components/dashboard/LoadingState";

export default function DashboardHomeLoading() {
  return (
    <div className="space-y-8">
      <MetricCardsLoadingState />
      <LoadingState rows={3} />
    </div>
  );
}
