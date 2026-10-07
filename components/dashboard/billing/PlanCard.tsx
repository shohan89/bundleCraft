import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BILLING_CURRENCY, type PlanChange, type PlanDefinition } from "@/lib/billing/plans";

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: BILLING_CURRENCY,
    minimumFractionDigits: 0,
  }).format(price);
}

export const limitLabel = (limit: number | null): string =>
  limit === null
    ? "Unlimited active bundles"
    : `${limit} active ${limit === 1 ? "bundle" : "bundles"}`;

interface PlanCardProps {
  plan: PlanDefinition;
  change: PlanChange;
  /** A request for this plan is waiting for approval at Shopify. */
  pending: boolean;
  /** Any billing operation is running: every action is locked to stop duplicate requests. */
  busy: boolean;
  /** This card's own action is the one running. */
  working: boolean;
  onSelect: () => void;
}

function actionLabel(plan: PlanDefinition, change: PlanChange, pending: boolean): string {
  if (change === "current") return "Current plan";
  if (plan.id === "free") return "Downgrade to Free";
  if (pending) return `Continue with ${plan.name}`;
  return change === "upgrade" ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`;
}

/** One pricing card. Everything shown comes from the plan config, never from local strings. */
export function PlanCard({ plan, change, pending, busy, working, onSelect }: PlanCardProps) {
  const current = change === "current";
  return (
    <Card
      className={`flex flex-col gap-4 px-5 py-5 ${current ? "border-primary ring-primary/30 ring-2" : ""}`}
      aria-label={`${plan.name} plan`}
      data-current={current ? "true" : "false"}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-foreground text-base font-semibold">{plan.name}</h3>
        {current ? <Badge>Current plan</Badge> : null}
      </div>

      <p className="text-foreground text-2xl font-semibold tabular-nums">
        {plan.price === 0 ? "Free" : formatPrice(plan.price)}
        {plan.price === 0 ? null : (
          <span className="text-muted-foreground text-sm font-normal"> / month</span>
        )}
      </p>

      <ul className="text-foreground flex-1 space-y-2 text-sm">
        {plan.highlights.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <Check className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <Button
        variant={current ? "outline" : change === "upgrade" ? "default" : "outline"}
        disabled={current || busy}
        onClick={onSelect}
      >
        {working ? "Working…" : actionLabel(plan, change, pending)}
      </Button>
    </Card>
  );
}
