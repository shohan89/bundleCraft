import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/api/client";
import { BundleRowActions } from "./BundleRowActions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn() }));
const mockedRequest = vi.mocked(apiRequest);

beforeEach(() => mockedRequest.mockReset());

async function publish() {
  render(<BundleRowActions bundleId="b1" title="Look" status="draft" />);
  await userEvent.click(screen.getByRole("button", { name: "Actions for Look" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Publish" }));
}

describe("BundleRowActions plan limit", () => {
  it("explains a PLAN_LIMIT_REACHED refusal and links to the billing page", async () => {
    mockedRequest.mockResolvedValue({
      ok: false,
      error: {
        code: "PLAN_LIMIT_REACHED",
        message: "Your current plan allows 1 active bundle. Upgrade your plan to publish more.",
        details: [],
      },
    });
    await publish();

    expect(await screen.findByText(/Upgrade your plan to publish more/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View plans" })).toHaveAttribute(
      "href",
      "/dashboard/billing",
    );
  });

  it("offers no upgrade link for other failures", async () => {
    mockedRequest.mockResolvedValue({
      ok: false,
      error: { code: "CONFLICT", message: "Changed by another request.", details: [] },
    });
    await publish();

    expect(await screen.findByText("Changed by another request.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View plans" })).not.toBeInTheDocument();
  });
});
