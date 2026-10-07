"use client";

import { useState } from "react";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { PlanCard, limitLabel } from "@/components/dashboard/billing/PlanCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api/client";
import { allPlans, getPlan, planChange } from "@/lib/billing/plans";
import type {
  BillingState,
  CancelBillingResponse,
  CreateBillingResponse,
  PlanId,
} from "@/lib/billing/types";

export type BillingFlash = "success" | "declined" | "pending" | "error";

const FLASH_TEXT: Record<BillingFlash, { tone: "default" | "destructive"; text: string }> = {
  success: { tone: "default", text: "Thanks! Your subscription is confirmed with Shopify." },
  declined: {
    tone: "destructive",
    text: "The subscription was not approved, so your plan has not changed.",
  },
  pending: {
    tone: "default",
    text: "Shopify has not confirmed the subscription yet. Your plan will update as soon as it does.",
  },
  error: {
    tone: "destructive",
    text: "We couldn't confirm the subscription with Shopify. Your plan has not changed.",
  },
};

const STATUS_LABEL = {
  active: "Active",
  pending: "Waiting for approval",
  cancelled: "Cancelled",
  expired: "Expired",
} as const;

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso));

/** The approval page is on Shopify; anything else is refused before navigating. */
function isShopifyUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname.endsWith(".shopify.com") || url.hostname.endsWith(".myshopify.com"))
    );
  } catch {
    return false;
  }
}

interface BillingPanelProps {
  initial: BillingState;
  flash?: BillingFlash | null;
}

export function BillingPanel({ initial, flash = null }: BillingPanelProps) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState<PlanId | "refresh" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const current = getPlan(state.plan);
  const paid = state.plan !== "free";

  async function refresh() {
    const result = await apiRequest<BillingState>("GET", "/api/billing/current");
    if (result.ok) setState(result.data);
    return result;
  }

  async function choose(target: PlanId) {
    if (busy) return;
    setError(null);
    if (target === "free") {
      setConfirmingCancel(true);
      return;
    }
    setBusy(target);
    const result = await apiRequest<CreateBillingResponse>("POST", "/api/billing/create", {
      plan: target,
    });
    if (!result.ok) {
      setBusy(null);
      setError(result.error.message);
      return;
    }
    if (!isShopifyUrl(result.data.confirmationUrl)) {
      setBusy(null);
      setError("Shopify returned an unexpected address, so the request was stopped.");
      return;
    }
    // Shopify's approval page must load as the top window, not inside the app's iframe.
    // The button stays locked: the merchant is leaving this page.
    window.open(result.data.confirmationUrl, "_top");
  }

  async function confirmCancel() {
    if (busy) return;
    setBusy("free");
    setError(null);
    const result = await apiRequest<CancelBillingResponse>("POST", "/api/billing/cancel");
    if (!result.ok) {
      setBusy(null);
      setConfirmingCancel(false);
      setError(result.error.message);
      return;
    }
    await refresh();
    setBusy(null);
    setConfirmingCancel(false);
  }

  async function recheck() {
    if (busy) return;
    setBusy("refresh");
    setError(null);
    const result = await refresh();
    if (!result.ok) setError(result.error.message);
    setBusy(null);
  }

  const { usage } = state;
  const subscription = state.subscription;

  return (
    <div className="space-y-6">
      {flash ? (
        <Alert variant={FLASH_TEXT[flash].tone}>
          <AlertDescription>{FLASH_TEXT[flash].text}</AlertDescription>
        </Alert>
      ) : null}

      {error ? <ErrorState title="That didn't work" message={error} /> : null}

      {state.verification === "unavailable" ? (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            We couldn&apos;t check your pending subscription with Shopify right now.
            <Button size="sm" variant="outline" onClick={recheck} disabled={busy !== null}>
              {busy === "refresh" ? "Checking…" : "Check again"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium">Current plan</p>
            <p className="text-foreground text-xl font-semibold">{current.name}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{STATUS_LABEL[state.status]}</Badge>
              {subscription?.isTest ? <Badge variant="outline">Test subscription</Badge> : null}
              {state.pendingPlan ? (
                <Badge variant="outline">
                  {getPlan(state.pendingPlan).name} waiting for approval
                </Badge>
              ) : null}
            </div>
            <div className="text-muted-foreground space-y-0.5 pt-1 text-sm">
              {subscription?.status === "active" && subscription.startedAt ? (
                <div>Started {formatDate(subscription.startedAt)}</div>
              ) : null}
              {subscription?.status === "active" && subscription.currentPeriodEnd ? (
                <div>Current period ends {formatDate(subscription.currentPeriodEnd)}</div>
              ) : null}
              {subscription && subscription.status !== "active" && subscription.cancelledAt ? (
                <div>
                  {getPlan(subscription.plan).name} subscription ended{" "}
                  {formatDate(subscription.cancelledAt)}
                </div>
              ) : null}
              {!subscription ? (
                <div>No paid subscription. You&apos;re on the Free plan.</div>
              ) : null}
            </div>
          </div>

          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground text-xs font-medium">Active bundles</p>
            <p className="text-foreground font-semibold tabular-nums">
              {usage.activeBundles}
              {usage.activeBundleLimit === null ? "" : ` of ${usage.activeBundleLimit}`}
            </p>
            <p className="text-muted-foreground text-xs">{limitLabel(usage.activeBundleLimit)}</p>
          </div>
        </div>

        {usage.overLimit ? (
          <Alert className="mt-4">
            <AlertDescription>
              You have {usage.activeBundles} active bundles but your plan allows{" "}
              {usage.activeBundleLimit}. They stay active, but you can&apos;t publish more until you
              deactivate some or upgrade.
            </AlertDescription>
          </Alert>
        ) : null}
      </Card>

      <section className="space-y-3" aria-label="Plans">
        <h2 className="text-foreground text-sm font-semibold">Plans</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {allPlans().map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              change={planChange(state.plan, plan.id)}
              pending={state.pendingPlan === plan.id}
              busy={busy !== null}
              working={busy === plan.id}
              onSelect={() => void choose(plan.id)}
            />
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          Billed monthly through Shopify. Changing plans opens Shopify&apos;s approval page; your
          plan only changes after Shopify confirms it.
        </p>
      </section>

      {paid ? (
        <div>
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => setConfirmingCancel(true)}
          >
            Cancel subscription
          </Button>
        </div>
      ) : null}

      <Dialog
        open={confirmingCancel}
        onOpenChange={(open) => (busy ? null : setConfirmingCancel(open))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel your {current.name} subscription?</DialogTitle>
            <DialogDescription>
              {paid
                ? "You'll move to the Free plan (1 active bundle, basic widget). Your bundles are kept and stay active, but you won't be able to publish more than the Free plan allows, and plan-only features like Analytics become unavailable. Shopify cancels the recurring charge."
                : "You're already on the Free plan."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmingCancel(false)}
              disabled={busy !== null}
            >
              Keep my plan
            </Button>
            {paid ? (
              <Button
                variant="destructive"
                onClick={() => void confirmCancel()}
                disabled={busy !== null}
              >
                {busy === "free" ? "Cancelling…" : "Cancel subscription"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
