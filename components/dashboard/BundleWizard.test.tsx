import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BundleWizard } from "./BundleWizard";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/bundles/create",
}));

const TEMPLATES = [
  { id: "t1", name: "Complete Look", category: "fashion" as const },
  { id: "t2", name: "Skincare Routine", category: "beauty" as const },
];

describe("BundleWizard", () => {
  it("starts on the Template step with Next disabled until a template is chosen", async () => {
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /Complete Look/ }));
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("advances through steps via Next and back via Back", async () => {
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);

    await user.click(screen.getByRole("radio", { name: /Complete Look/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Step 2: Products
    expect(screen.getByText(/Product search isn't connected yet/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));

    // Back on step 1: the template we picked should still be selected.
    expect(screen.getByRole("radio", { name: /Complete Look/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("blocks advancing past the Discount step until a valid value is entered", async () => {
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);

    await user.click(screen.getByRole("radio", { name: /Complete Look/ }));
    await user.click(screen.getByRole("button", { name: "Next" })); // -> Products
    await user.click(screen.getByRole("button", { name: "Next" })); // -> Discount

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await user.type(screen.getByLabelText("Percentage off"), "20");
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

    await user.clear(screen.getByLabelText("Percentage off"));
    await user.type(screen.getByLabelText("Percentage off"), "150");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByText("Percentage discount can't exceed 100%.")).toBeInTheDocument();
  });

  it("reaches the review step with disabled Save draft / Publish (no bundle engine yet)", async () => {
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);

    await user.click(screen.getByRole("radio", { name: /Complete Look/ }));
    await user.click(screen.getByRole("button", { name: "Next" })); // Products
    await user.click(screen.getByRole("button", { name: "Next" })); // Discount
    await user.type(screen.getByLabelText("Percentage off"), "20");
    await user.click(screen.getByRole("button", { name: "Next" })); // Design
    await user.click(screen.getByRole("button", { name: "Next" })); // Publish

    // "Complete Look" legitimately appears twice on this step: once in the
    // summary <dl> and once in the storefront preview (which falls back to
    // the template name when no custom bundle title was entered).
    expect(screen.getAllByText("Complete Look").length).toBeGreaterThan(0);
    expect(screen.getAllByText("20% off").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("Cancel links back to the bundles list", () => {
    render(<BundleWizard templates={TEMPLATES} />);
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/dashboard/bundles",
    );
  });
});
