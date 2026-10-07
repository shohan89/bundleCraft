import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/api/client";
import { PLANS } from "@/lib/billing/plans";
import type { BillingState, PlanId } from "@/lib/billing/types";
import { UpgradePrompt } from "@/components/dashboard/UpgradePrompt";
import { BillingPanel } from "./BillingPanel";

vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn() }));
const mockedRequest = vi.mocked(apiRequest);
const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

const state = (over: Partial<BillingState> = {}, plan: PlanId = "free"): BillingState => ({
  plan,
  status: "active",
  subscription: null,
  pendingPlan: null,
  verification: "ok",
  features: { ...PLANS[plan].features },
  usage: {
    activeBundles: 0,
    activeBundleLimit: PLANS[plan].limits.activeBundles,
    overLimit: false,
  },
  ...over,
});

const growth = (): BillingState =>
  state(
    {
      subscription: {
        plan: "growth",
        status: "active",
        startedAt: "2026-09-01T00:00:00Z",
        cancelledAt: null,
        currentPeriodEnd: "2026-10-01T00:00:00Z",
        isTest: true,
      },
    },
    "growth",
  );

const card = (name: string) => screen.getByLabelText(`${name} plan`);

beforeEach(() => {
  mockedRequest.mockReset();
  openSpy.mockClear();
});

describe("BillingPanel: display", () => {
  it("shows the current plan, its status and active-bundle usage from server state", () => {
    render(
      <BillingPanel
        initial={state({ usage: { activeBundles: 1, activeBundleLimit: 1, overLimit: false } })}
      />,
    );
    expect(screen.getByText("Current plan", { selector: "p" })).toBeInTheDocument();
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
    expect(screen.getByText(/No paid subscription/)).toBeInTheDocument();
  });

  it("renders a card per plan with its documented price and features, from the config", () => {
    render(<BillingPanel initial={state()} />);
    for (const plan of Object.values(PLANS)) {
      const c = card(plan.name);
      for (const highlight of plan.highlights)
        expect(within(c).getByText(highlight)).toBeInTheDocument();
    }
    expect(within(card("Starter")).getByText(/\$19/)).toBeInTheDocument();
    expect(within(card("Growth")).getByText(/\$39/)).toBeInTheDocument();
    expect(within(card("Pro")).getByText(/\$79/)).toBeInTheDocument();
  });

  it("highlights only the current plan and disables its button", () => {
    render(<BillingPanel initial={growth()} />);
    expect(card("Growth")).toHaveAttribute("data-current", "true");
    for (const name of ["Free", "Starter", "Pro"]) {
      expect(card(name)).toHaveAttribute("data-current", "false");
    }
    expect(within(card("Growth")).getByRole("button", { name: "Current plan" })).toBeDisabled();
    expect(within(card("Pro")).getByRole("button", { name: "Upgrade to Pro" })).toBeEnabled();
    expect(
      within(card("Starter")).getByRole("button", { name: "Switch to Starter" }),
    ).toBeEnabled();
    expect(within(card("Free")).getByRole("button", { name: "Downgrade to Free" })).toBeEnabled();
  });

  it("shows subscription details and a truthful test-charge badge", () => {
    render(<BillingPanel initial={growth()} />);
    expect(screen.getByText("Test subscription")).toBeInTheDocument();
    expect(screen.getByText(/Started/)).toBeInTheDocument();
    expect(screen.getByText(/Current period ends/)).toBeInTheDocument();
  });

  it("shows a cancelled subscription as history while the plan is Free", () => {
    render(
      <BillingPanel
        initial={state({
          status: "cancelled",
          subscription: {
            plan: "starter",
            status: "cancelled",
            startedAt: "2026-08-01T00:00:00Z",
            cancelledAt: "2026-09-10T00:00:00Z",
            currentPeriodEnd: null,
            isTest: false,
          },
        })}
      />,
    );
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText(/Starter subscription ended/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel subscription" })).not.toBeInTheDocument();
  });

  it("marks a plan waiting for approval and offers to continue", () => {
    render(<BillingPanel initial={state({ pendingPlan: "growth" })} />);
    expect(screen.getByText("Growth waiting for approval")).toBeInTheDocument();
    expect(
      within(card("Growth")).getByRole("button", { name: "Continue with Growth" }),
    ).toBeEnabled();
  });

  it("warns, without hiding anything, when a plan change leaves more active bundles than allowed", () => {
    render(
      <BillingPanel
        initial={state({ usage: { activeBundles: 3, activeBundleLimit: 1, overLimit: true } })}
      />,
    );
    expect(screen.getByText(/3 active bundles but your plan allows 1/)).toBeInTheDocument();
  });

  it("says so when Shopify couldn't verify a pending change, and can re-check", async () => {
    mockedRequest.mockResolvedValueOnce({ ok: true, data: state() });
    render(<BillingPanel initial={state({ verification: "unavailable" })} />);
    expect(screen.getByText(/couldn't check your pending subscription/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(screen.queryByText(/couldn't check/)).not.toBeInTheDocument());
    expect(mockedRequest).toHaveBeenCalledWith("GET", "/api/billing/current");
  });

  it.each([
    ["success", /subscription is confirmed/],
    ["declined", /not approved/],
    ["pending", /not confirmed the subscription yet/],
    ["error", /couldn't confirm/],
  ] as const)("shows a %s return banner", (flash, text) => {
    render(<BillingPanel initial={state()} flash={flash} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe("BillingPanel: upgrade", () => {
  it("asks the server for the plan (only the plan name) and sends the merchant to Shopify's approval page", async () => {
    mockedRequest.mockResolvedValueOnce({
      ok: true,
      data: {
        confirmationUrl: "https://admin.shopify.com/store/x/charges/1/confirm",
        plan: "growth",
        resumed: false,
      },
    });
    render(<BillingPanel initial={state()} />);
    await userEvent.click(
      within(card("Growth")).getByRole("button", { name: "Upgrade to Growth" }),
    );

    expect(mockedRequest).toHaveBeenCalledWith("POST", "/api/billing/create", { plan: "growth" });
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        "https://admin.shopify.com/store/x/charges/1/confirm",
        "_top",
      ),
    );
  });

  it("locks every action while the request runs, so a double click can't send two", async () => {
    let resolve: (value: unknown) => void = () => {};
    mockedRequest.mockReturnValueOnce(new Promise((r) => (resolve = r)) as never);
    render(<BillingPanel initial={state()} />);

    await userEvent.click(
      within(card("Starter")).getByRole("button", { name: "Upgrade to Starter" }),
    );
    expect(within(card("Starter")).getByRole("button", { name: "Working…" })).toBeDisabled();
    for (const name of ["Growth", "Pro"]) {
      expect(within(card(name)).getByRole("button")).toBeDisabled();
    }
    await userEvent.click(within(card("Growth")).getByRole("button"));
    expect(mockedRequest).toHaveBeenCalledTimes(1);

    resolve({ ok: false, error: { code: "X", message: "nope", details: [] } });
    await waitFor(() =>
      expect(
        within(card("Starter")).getByRole("button", { name: "Upgrade to Starter" }),
      ).toBeEnabled(),
    );
  });

  it("shows the server's safe message on failure and re-enables the buttons", async () => {
    mockedRequest.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "BILLING_CREATION_FAILED",
        message: "We couldn't start the subscription with Shopify.",
        details: [],
      },
    });
    render(<BillingPanel initial={state()} />);
    await userEvent.click(within(card("Pro")).getByRole("button", { name: "Upgrade to Pro" }));

    expect(await screen.findByText(/couldn't start the subscription/)).toBeInTheDocument();
    expect(within(card("Pro")).getByRole("button", { name: "Upgrade to Pro" })).toBeEnabled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("refuses to navigate to a URL that isn't Shopify's", async () => {
    mockedRequest.mockResolvedValueOnce({
      ok: true,
      data: { confirmationUrl: "https://evil.example.com/pay", plan: "pro", resumed: false },
    });
    render(<BillingPanel initial={state()} />);
    await userEvent.click(within(card("Pro")).getByRole("button", { name: "Upgrade to Pro" }));

    expect(await screen.findByText(/unexpected address/)).toBeInTheDocument();
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe("BillingPanel: cancellation", () => {
  it("asks for confirmation first, explaining the consequences, and does nothing if declined", async () => {
    render(<BillingPanel initial={growth()} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel subscription" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Cancel your Growth subscription?")).toBeInTheDocument();
    expect(within(dialog).getByText(/move to the Free plan/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep my plan" }));
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it("cancels on confirmation, then shows the server's new state", async () => {
    mockedRequest
      .mockResolvedValueOnce({ ok: true, data: { plan: "free", status: "cancelled" } })
      .mockResolvedValueOnce({ ok: true, data: state({ status: "cancelled" }) });
    render(<BillingPanel initial={growth()} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel subscription" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel subscription" }));

    await waitFor(() => expect(mockedRequest).toHaveBeenCalledWith("POST", "/api/billing/cancel"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(card("Free")).toHaveAttribute("data-current", "true");
    expect(screen.queryByRole("button", { name: "Cancel subscription" })).not.toBeInTheDocument();
  });

  it("the Free card's downgrade opens the same confirmation", async () => {
    render(<BillingPanel initial={growth()} />);
    await userEvent.click(within(card("Free")).getByRole("button", { name: "Downgrade to Free" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it("keeps the plan and shows the error when Shopify can't cancel", async () => {
    mockedRequest.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "SUBSCRIPTION_CANCEL_FAILED",
        message: "We couldn't cancel your subscription with Shopify.",
        details: [],
      },
    });
    render(<BillingPanel initial={growth()} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel subscription" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel subscription" }));

    expect(await screen.findByText(/couldn't cancel your subscription/)).toBeInTheDocument();
    expect(card("Growth")).toHaveAttribute("data-current", "true");
  });
});

describe("UpgradePrompt", () => {
  it("explains the limit and links to the billing page", () => {
    render(
      <UpgradePrompt
        title="Analytics is part of the Growth plan"
        description="Upgrade to see it."
      />,
    );
    expect(screen.getByText("Analytics is part of the Growth plan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View plans" })).toHaveAttribute(
      "href",
      "/dashboard/billing",
    );
  });
});
