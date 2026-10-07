import { templateFixture } from "@/lib/templates/testing";
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { DollarSign } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsDashboard } from "@/components/dashboard/AnalyticsDashboard";
import { BillingPanel } from "@/components/dashboard/billing/BillingPanel";
import { BundleTable } from "@/components/dashboard/BundleTable";
import { BundleWizard } from "@/components/dashboard/BundleWizard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { NavLinks } from "@/components/dashboard/Sidebar";
import { UpgradePrompt } from "@/components/dashboard/UpgradePrompt";
import { PLANS } from "@/lib/billing/plans";
import type { BillingState } from "@/lib/billing/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/api/client", () => ({
  apiRequest: vi.fn(async () => ({
    ok: true,
    data: {
      views: 10,
      adds: 4,
      purchases: 1,
      revenue: [{ currency: "USD", amount: 20 }],
      conversionRate: 10,
      range: { from: null, to: null },
      bundleId: null,
      byBundle: [
        {
          bundleId: "b1",
          title: "<b>Look</b>",
          views: 10,
          adds: 4,
          purchases: 1,
          revenue: [{ currency: "USD", amount: 20 }],
          conversionRate: 10,
        },
      ],
    },
  })),
}));

/** Automated WCAG 2 A/AA checks that a DOM without layout can run (colour contrast needs a real browser). */
async function violations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
    rules: {
      "color-contrast": { enabled: false }, // needs layout
      region: { enabled: false }, // fragments are rendered outside a page landmark
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
    },
  });
  return results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(" | ")})`,
  );
}

const billing: BillingState = {
  plan: "growth",
  status: "active",
  subscription: {
    plan: "growth",
    status: "active",
    startedAt: "2026-09-01T00:00:00Z",
    cancelledAt: null,
    currentPeriodEnd: "2026-10-01T00:00:00Z",
    isTest: true,
  },
  pendingPlan: "pro",
  verification: "unavailable",
  features: { ...PLANS.growth.features },
  usage: { activeBundles: 3, activeBundleLimit: 1, overLimit: true },
};

describe("dashboard accessibility (axe-core, WCAG 2.1 A/AA)", () => {
  it("navigation", async () => {
    const { container } = render(<NavLinks />);
    expect(await violations(container)).toEqual([]);
  });

  it("metric card, empty state, error state, upgrade prompt", async () => {
    const { container } = render(
      <div>
        <MetricCard label="Revenue" value="$1.00" icon={DollarSign} />
        <MetricCard label="Revenue" value={null} icon={DollarSign} />
        <EmptyState icon={DollarSign} title="Nothing yet" description="Create a bundle." />
        <ErrorState onRetry={() => {}} />
        <UpgradePrompt title="Analytics is part of Growth" description="Upgrade." />
      </div>,
    );
    expect(await violations(container)).toEqual([]);
  });

  it("billing page in its busiest state (pending plan, warnings, over limit)", async () => {
    const { container } = render(<BillingPanel initial={billing} flash="declined" />);
    expect(await violations(container)).toEqual([]);
  });

  it("analytics dashboard with data, filters and table", async () => {
    const { container } = render(<AnalyticsDashboard bundles={[{ id: "b1", title: "Look" }]} />);
    await screen.findByText("By bundle");
    expect(await violations(container)).toEqual([]);
  });

  it("bundle table (desktop and mobile layouts) with hostile titles", async () => {
    const { container } = render(
      <BundleTable
        bundles={[
          {
            id: "b1",
            title: "<img src=x onerror=alert(1)>",
            bundleType: "fixed",
            status: "active",
            createdAt: new Date("2026-09-01"),
            revenue: [{ currency: "USD", amount: 10 }],
            productIssues: 0,
          },
        ]}
      />,
    );
    expect(await violations(container)).toEqual([]);
  });

  it("create-bundle wizard, first step", async () => {
    const { container } = render(
      <BundleWizard templates={[templateFixture("complete-look", "t1")]} />,
    );
    expect(await violations(container)).toEqual([]);
  });
});

describe("rendering of merchant-controlled text (XSS)", () => {
  it("escapes markup in bundle titles instead of parsing it", () => {
    const { container } = render(
      <BundleTable
        bundles={[
          {
            id: "b1",
            title: "<img src=x onerror=alert(1)><script>alert(2)</script>",
            bundleType: "fixed",
            status: "draft",
            createdAt: new Date("2026-09-01"),
            revenue: [],
            productIssues: 2,
          },
        ]}
      />,
    );
    expect(container.querySelector("img[src='x']")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("escapes markup in analytics bundle names", async () => {
    const { container } = render(<AnalyticsDashboard bundles={[]} />);
    await screen.findByText("By bundle");
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<b>Look</b>");
  });
});

describe("bundle table product issues", () => {
  it("flags bundles whose products are gone, and says nothing for healthy ones", () => {
    const base = {
      bundleType: "fixed" as const,
      status: "active" as const,
      createdAt: new Date("2026-09-01"),
      revenue: [],
    };
    render(
      <BundleTable
        bundles={[
          { ...base, id: "a", title: "Broken", productIssues: 2 },
          { ...base, id: "b", title: "Fine", productIssues: 0 },
          { ...base, id: "c", title: "One", productIssues: 1 },
        ]}
      />,
    );
    expect(screen.getAllByText("2 products need attention").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 product needs attention").length).toBeGreaterThan(0);
    expect(screen.queryByText(/0 products/)).toBeNull();
  });
});
