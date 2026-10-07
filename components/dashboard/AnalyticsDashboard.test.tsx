import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsOverview } from "@/lib/analytics/types";
import { apiRequest } from "@/lib/api/client";
import { AnalyticsDashboard, buildOverviewQuery } from "./AnalyticsDashboard";

vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn() }));
const mockedRequest = vi.mocked(apiRequest);

const bundles = [
  { id: "b1", title: "Complete Look" },
  { id: "b2", title: "Skincare Set" },
];

const overview = (over: Partial<AnalyticsOverview> = {}): AnalyticsOverview => ({
  views: 100,
  adds: 40,
  purchases: 10,
  revenue: [{ currency: "USD", amount: 1234.5 }],
  conversionRate: 10,
  range: { from: null, to: null },
  bundleId: null,
  byBundle: [
    {
      bundleId: "b1",
      title: "Complete Look",
      views: 100,
      adds: 40,
      purchases: 10,
      revenue: [{ currency: "USD", amount: 1234.5 }],
      conversionRate: 10,
    },
  ],
  ...over,
});

const empty = overview({
  views: 0,
  adds: 0,
  purchases: 0,
  revenue: [],
  conversionRate: 0,
  byBundle: [],
});

beforeEach(() => {
  mockedRequest.mockReset();
});

describe("AnalyticsDashboard states", () => {
  it("shows a loading state, not zeros, while the request is in flight", () => {
    mockedRequest.mockReturnValue(new Promise(() => {}));
    render(<AnalyticsDashboard bundles={bundles} />);
    expect(screen.getByRole("status", { name: "Loading analytics" })).toBeInTheDocument();
    expect(screen.queryByText("Bundle views")).not.toBeInTheDocument();
  });

  it("shows the five metrics and the per-bundle table from the API", async () => {
    mockedRequest.mockResolvedValue({ ok: true, data: overview() });
    render(<AnalyticsDashboard bundles={bundles} />);

    expect(await screen.findByText("Bundle views")).toBeInTheDocument();
    expect(screen.getByText("Bundle adds")).toBeInTheDocument();
    expect(screen.getByText("Bundle purchases")).toBeInTheDocument();
    expect(screen.getByText("Revenue generated")).toBeInTheDocument();
    expect(screen.getByText("Conversion rate")).toBeInTheDocument();
    expect(screen.getAllByText("$1,234.50").length).toBeGreaterThan(0);
    expect(screen.getAllByText("10%").length).toBeGreaterThan(0);
    expect(screen.getByRole("columnheader", { name: "Bundle" })).toBeInTheDocument();
  });

  it("shows an empty state, and no fake numbers, when there is no activity", async () => {
    mockedRequest.mockResolvedValue({ ok: true, data: empty });
    render(<AnalyticsDashboard bundles={bundles} />);

    expect(await screen.findByText("No bundle activity yet")).toBeInTheDocument();
    expect(screen.getByText(/Create and publish a bundle to start collecting/)).toBeInTheDocument();
    expect(screen.queryByText("Bundle views")).not.toBeInTheDocument();
  });

  it("shows a safe error message with a working retry", async () => {
    mockedRequest.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
        details: [],
      },
    });
    mockedRequest.mockResolvedValueOnce({ ok: true, data: overview() });
    render(<AnalyticsDashboard bundles={bundles} />);

    expect(await screen.findByText("Analytics could not load")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Bundle views")).toBeInTheDocument();
    expect(mockedRequest).toHaveBeenCalledTimes(2);
  });
});

describe("AnalyticsDashboard filters", () => {
  it("requests the overview API for the chosen period and bundle, never sending a shop id", async () => {
    mockedRequest.mockResolvedValue({ ok: true, data: overview() });
    render(<AnalyticsDashboard bundles={bundles} />);
    await screen.findByText("Bundle views");

    expect(mockedRequest.mock.calls[0]).toEqual(["GET", "/api/analytics/overview"]);

    await userEvent.selectOptions(screen.getByLabelText("Period"), "30d");
    await waitFor(() =>
      expect(mockedRequest.mock.calls.at(-1)![1]).toMatch(
        /^\/api\/analytics\/overview\?startDate=\d{4}-\d{2}-\d{2}&endDate=\d{4}-\d{2}-\d{2}$/,
      ),
    );

    await userEvent.selectOptions(screen.getByLabelText("Bundle"), "b2");
    await waitFor(() => expect(mockedRequest.mock.calls.at(-1)![1]).toContain("bundleId=b2"));

    await userEvent.selectOptions(screen.getByLabelText("Period"), "all");
    await waitFor(() =>
      expect(mockedRequest.mock.calls.at(-1)![1]).toBe("/api/analytics/overview?bundleId=b2"),
    );
    expect(mockedRequest.mock.calls.every((call) => !String(call[1]).includes("shop"))).toBe(true);
  });

  it("explains an empty filtered result differently from a store with no data", async () => {
    mockedRequest.mockResolvedValue({ ok: true, data: empty });
    render(<AnalyticsDashboard bundles={bundles} />);
    await screen.findByText("No bundle activity yet");
    await userEvent.selectOptions(screen.getByLabelText("Period"), "7d");
    expect(await screen.findByText("No activity for these filters")).toBeInTheDocument();
  });
});

describe("buildOverviewQuery", () => {
  const now = new Date("2026-09-24T15:00:00Z");

  it("builds UTC day ranges", () => {
    expect(buildOverviewQuery("all", "", now)).toBe("");
    expect(buildOverviewQuery("today", "", now)).toBe("?startDate=2026-09-24&endDate=2026-09-24");
    expect(buildOverviewQuery("7d", "", now)).toBe("?startDate=2026-09-18&endDate=2026-09-24");
    expect(buildOverviewQuery("30d", "abc", now)).toBe(
      "?startDate=2026-08-26&endDate=2026-09-24&bundleId=abc",
    );
  });
});
