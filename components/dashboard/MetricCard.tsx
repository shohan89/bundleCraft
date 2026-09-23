import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

interface MetricCardProps {
  label: string;
  /** Pass `null` to render the "No data yet" state instead of a value. */
  value: string | null;
  icon: LucideIcon;
  helpText?: string;
}

export function MetricCard({ label, value, icon: Icon, helpText }: MetricCardProps) {
  return (
    <Card className="px-5">
      <div className="flex items-start justify-between">
        <p className="text-muted-foreground text-sm font-medium">{label}</p>
        <Icon className="text-muted-foreground size-4" aria-hidden="true" />
      </div>
      <p className="text-foreground mt-2 text-2xl font-semibold tabular-nums">
        {value ?? <span className="text-muted-foreground">No data yet</span>}
      </p>
      {helpText ? <p className="text-muted-foreground mt-1 text-xs">{helpText}</p> : null}
    </Card>
  );
}
