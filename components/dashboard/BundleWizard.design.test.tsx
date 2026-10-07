import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CUSTOMIZATION } from "@/lib/customization/defaults";
import type { BundleCustomization } from "@/lib/customization/types";
import { templateFixture } from "@/lib/templates/testing";
import { BundleWizard } from "./BundleWizard";
import { CustomizationEditor } from "./wizard/CustomizationEditor";
import { INITIAL_WIZARD_STATE } from "./wizard/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/bundles/create",
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const TEMPLATES = [templateFixture("seasonal-collection", "t-season")];
const fetchMock = vi.fn();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  push.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    String(url).startsWith("/api/products")
      ? Promise.resolve(
          json(200, {
            success: true,
            data: {
              items: [],
              page: 1,
              limit: 20,
              total: 0,
              catalog: { status: "synced", syncedAt: null, error: null },
            },
          }),
        )
      : fetchMock(url, init),
  );
});
afterEach(() => vi.unstubAllGlobals());

type User = ReturnType<typeof userEvent.setup>;
const next = (user: User) => user.click(screen.getByRole("button", { name: "Next" }));

async function toDesignStep(user: User) {
  await user.click(screen.getByRole("radio", { name: /Seasonal Collection/ }));
  await user.click(screen.getByRole("button", { name: "Use this template" }));
  await next(user); // Products
  await next(user); // Discount
  await next(user); // Design
  await screen.findByTestId("widget-preview"); // the preview is loaded on demand
  await waitFor(() =>
    expect(screen.getByTestId("widget-preview").querySelector(".bc-widget")).not.toBeNull(),
  );
}

/** The editor with real state, so a change flows through onChange like in the wizard. */
function Harness({ initial = DEFAULT_CUSTOMIZATION }: { initial?: BundleCustomization }) {
  const [value, setValue] = useState(structuredClone(initial));
  return (
    <>
      <CustomizationEditor
        value={value}
        onChange={setValue}
        onReset={() => setValue(structuredClone(DEFAULT_CUSTOMIZATION))}
        resetLabel="Reset to defaults"
      />
      <output data-testid="state">{JSON.stringify(value)}</output>
    </>
  );
}
const current = () => JSON.parse(screen.getByTestId("state").textContent!) as BundleCustomization;

describe("customization controls", () => {
  it("offers every documented control with an accessible label", () => {
    render(<Harness />);
    for (const label of [
      "Layout",
      "Spacing",
      "Primary color",
      "Button color",
      "Background color",
      "Accent color",
      "Text color",
      "Font",
      "Font size (px)",
      "Heading size",
      "Description size",
      "Corner radius",
      "Shadow",
      "Button style",
      "Button size",
    ]) {
      expect(screen.getByLabelText(label), label).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Reset to defaults" })).toBeInTheDocument();
    for (const group of ["Layout", "Colors", "Typography", "Cards", "Button"]) {
      expect(screen.getByRole("group", { name: group })).toBeInTheDocument();
    }
  });

  it("offers only the predefined options for each choice", () => {
    render(<Harness />);
    const options = (label: string) =>
      within(screen.getByLabelText(label))
        .getAllByRole("option")
        .map((option) => (option as HTMLOptionElement).value);
    expect(options("Layout")).toEqual(["card", "horizontal", "vertical"]);
    expect(options("Font")).toEqual(["theme", "sans", "serif", "mono"]);
    expect(options("Heading size")).toEqual(["small", "medium", "large"]);
    expect(options("Corner radius")).toEqual(["none", "small", "medium", "large"]);
    expect(options("Shadow")).toEqual(["none", "subtle", "strong"]);
    expect(options("Button style")).toEqual(["filled", "outline"]);
    expect(options("Button size")).toEqual(["small", "medium", "large"]);
    expect(options("Spacing")).toEqual(["compact", "comfortable"]);
  });

  it("changing each select updates the design", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(screen.getByLabelText("Layout"), "horizontal");
    await user.selectOptions(screen.getByLabelText("Font"), "serif");
    await user.selectOptions(screen.getByLabelText("Heading size"), "large");
    await user.selectOptions(screen.getByLabelText("Description size"), "small");
    await user.selectOptions(screen.getByLabelText("Corner radius"), "none");
    await user.selectOptions(screen.getByLabelText("Shadow"), "strong");
    await user.selectOptions(screen.getByLabelText("Button style"), "outline");
    await user.selectOptions(screen.getByLabelText("Button size"), "small");
    await user.selectOptions(screen.getByLabelText("Spacing"), "compact");
    expect(current()).toMatchObject({
      layout: "horizontal",
      typography: { fontFamily: "serif", titleSize: "large", descriptionSize: "small" },
      card: { borderRadius: "none", shadow: "strong" },
      button: { style: "outline", size: "small" },
      spacing: { density: "compact" },
    });
  });

  it("a color can be typed as #RRGGBB, and only a valid value is committed", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByLabelText("Primary color");
    await user.clear(field);
    await user.type(field, "#12ab");
    expect(current().colors.primary).toBe("#111827"); // half-typed: not committed
    expect(screen.getByRole("alert")).toHaveTextContent("Use a color like #1A2B3C");
    expect(field).toHaveAttribute("aria-invalid", "true");
    await user.type(field, "ef");
    expect(current().colors.primary).toBe("#12abef");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refuses non-color text such as rgb(), url() or markup", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByLabelText("Button color");
    for (const bad of ["rgb(0", "url(x)", "red", "<b>"]) {
      await user.clear(field);
      await user.type(field, bad);
      expect(current().colors.button).toBe("#111827");
      expect(screen.getByRole("alert")).toBeInTheDocument();
    }
    expect(field).toHaveAttribute("maxlength", "7");
  });

  it("the color picker changes the color", async () => {
    render(<Harness />);
    const picker = screen.getByLabelText("Text color picker") as HTMLInputElement;
    expect(picker.type).toBe("color");
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(picker, { target: { value: "#00ff00" } });
    expect(current().colors.text).toBe("#00ff00");
    expect(screen.getByLabelText("Text color")).toHaveValue("#00ff00");
  });

  it("flags an out-of-range font size next to the field", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const size = screen.getByLabelText("Font size (px)");
    await user.clear(size);
    await user.type(size, "99");
    expect(size).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("whole number from 12 to 24");
  });

  it("warns, without blocking, when colors are hard to read together", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole("status", { name: "Color contrast advice" })).toBeNull();
    const text = screen.getByLabelText("Text color");
    await user.clear(text);
    await user.type(text, "#eeeeee");
    const advice = screen.getByRole("status", { name: "Color contrast advice" });
    expect(advice).toHaveTextContent(/Text color may be hard to read/);
    expect(current().colors.text).toBe("#eeeeee"); // advice, not a block
  });

  it("Reset restores the defaults", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ ...DEFAULT_CUSTOMIZATION, layout: "vertical" }} />);
    expect(current().layout).toBe("vertical");
    await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(current()).toEqual(DEFAULT_CUSTOMIZATION);
  });

  it("has no axe violations, including with errors and warnings showing", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const run = async () =>
      (
        await axe.run(container, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
          },
          rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
        })
      ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
    expect(await run()).toEqual([]);
    await user.type(screen.getByLabelText("Primary color"), "x");
    await user.clear(screen.getByLabelText("Text color"));
    await user.type(screen.getByLabelText("Text color"), "#f0f0f0");
    await user.clear(screen.getByLabelText("Font size (px)"));
    await user.type(screen.getByLabelText("Font size (px)"), "99");
    expect(await run()).toEqual([]);
  });

  it("everything is keyboard reachable in a logical order", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab(); // Reset
    expect(screen.getByRole("button", { name: "Reset to defaults" })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Layout")).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Spacing")).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Primary color picker")).toHaveFocus();
  });
});

describe("design step: live preview", () => {
  it("shows the real storefront widget with sample products before any are chosen", async () => {
    const user = userEvent.setup();
    const { container } = render(<BundleWizard templates={TEMPLATES} />);
    await toDesignStep(user);

    const preview = screen.getByTestId("widget-preview");
    expect(preview.querySelector(".bc-widget")).not.toBeNull();
    expect(within(preview).getAllByText(/Sample product/)).toHaveLength(3);
    expect(
      within(preview).getByRole("heading", { name: "Seasonal Collection" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/shown with sample products/)).toBeInTheDocument();
    expect(container.querySelector("[inert]")).not.toBeNull();
  });

  it("starts from the template design and follows every change immediately", async () => {
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);
    await toDesignStep(user);

    const widget = () =>
      screen.getByTestId("widget-preview").querySelector<HTMLElement>(".bc-widget")!;
    // Seasonal Collection: vertical layout, serif, warm colors.
    expect(widget().dataset.layout).toBe("vertical");
    expect(widget().style.getPropertyValue("--bc-bg")).toBe("#fff7ed");
    expect(widget().style.getPropertyValue("--bc-font-family")).toContain("Georgia");

    await user.selectOptions(screen.getByLabelText("Layout"), "horizontal");
    expect(widget().dataset.layout).toBe("horizontal");

    const button = screen.getByLabelText("Button color");
    await user.clear(button);
    await user.type(button, "#0a0b0c");
    expect(widget().style.getPropertyValue("--bc-button")).toBe("#0a0b0c");

    await user.selectOptions(screen.getByLabelText("Button style"), "outline");
    expect(widget().dataset.buttonStyle).toBe("outline");
    await user.selectOptions(screen.getByLabelText("Corner radius"), "none");
    expect(widget().style.getPropertyValue("--bc-radius")).toBe("0");
    await user.selectOptions(screen.getByLabelText("Spacing"), "compact");
    expect(widget().style.getPropertyValue("--bc-pad")).toBe(".75rem");
  });

  it("can switch to the bundles page card, which wears the same design", async () => {
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);
    await toDesignStep(user);
    await user.click(screen.getByRole("button", { name: "Bundles page" }));

    const card = screen
      .getByTestId("widget-preview")
      .querySelector<HTMLElement>(".bc-bundle-card")!;
    expect(card).not.toBeNull();
    expect(card.dataset.layout).toBe("vertical");
    expect(card.style.getPropertyValue("--bc-bg")).toBe("#fff7ed");
    expect(screen.getByRole("button", { name: "Bundles page" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Product page" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("never touches the network", async () => {
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);
    await toDesignStep(user);
    await user.selectOptions(screen.getByLabelText("Layout"), "card");
    await user.click(screen.getByRole("button", { name: "Bundles page" }));
    expect(fetchMock).not.toHaveBeenCalled(); // (product-catalog requests belong to the Products step)
  });

  it("the preview is not interactive: nothing in it can be focused or clicked", async () => {
    const user = userEvent.setup();
    const { container } = render(<BundleWizard templates={TEMPLATES} />);
    await toDesignStep(user);
    const host = container.querySelector("[inert]") as HTMLElement;
    expect(host.hasAttribute("inert")).toBe(true);
    expect(host.querySelectorAll("button").length).toBeGreaterThan(0); // present, but inert
  });

  it("Reset returns to the template's design when there is a template", async () => {
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);
    await toDesignStep(user);
    await user.selectOptions(screen.getByLabelText("Layout"), "card");
    await user.click(screen.getByRole("button", { name: "Reset to template design" }));
    expect(screen.getByLabelText("Layout")).toHaveValue("vertical");
  });

  it("Reset returns to the defaults for a bundle with no template", async () => {
    const user = userEvent.setup();
    render(
      <BundleWizard
        templates={TEMPLATES}
        bundleId="b1"
        initialState={{
          ...INITIAL_WIZARD_STATE,
          discountValue: "10",
          customization: { ...DEFAULT_CUSTOMIZATION, layout: "horizontal" },
        }}
      />,
    );
    for (let i = 0; i < 3; i++) await next(user);
    expect(screen.getByLabelText("Layout")).toHaveValue("horizontal");
    await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(screen.getByLabelText("Layout")).toHaveValue("card");
  });

  it("blocks Next while the design is invalid, and explains why", async () => {
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);
    await toDesignStep(user);
    const size = screen.getByLabelText("Font size (px)");
    await user.clear(size);
    await user.type(size, "99");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("12 to 24");
    await user.clear(size);
    await user.type(size, "18");
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("the preview uses the merchant's real chosen products", async () => {
    render(
      <BundleWizard
        templates={TEMPLATES}
        bundleId="b1"
        initialState={{
          ...INITIAL_WIZARD_STATE,
          discountValue: "10",
          products: [
            {
              shopifyProductId: "1",
              shopifyVariantId: "11",
              quantity: 1,
              title: "Linen Shirt",
              variantTitle: "M",
              imageUrl: "https://cdn.shopify.com/shirt.jpg",
              price: "40.00",
              availability: "available",
            },
          ],
        }}
      />,
    );
    const user = userEvent.setup();
    for (let i = 0; i < 3; i++) await next(user);
    const preview = await screen.findByTestId("widget-preview");
    expect(await within(preview).findByText("Linen Shirt")).toBeInTheDocument();
    expect(within(preview).queryByText(/Sample product/)).toBeNull();
    expect(screen.queryByText(/shown with sample products/)).toBeNull();
  });
});

describe("saving the design", () => {
  it("sends the nested customization with the bundle, validated again by the server", async () => {
    fetchMock.mockResolvedValue(json(201, { success: true, data: { bundle: { id: "b1" } } }));
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);
    await toDesignStep(user);
    await user.selectOptions(screen.getByLabelText("Font"), "mono");
    await user.selectOptions(screen.getByLabelText("Shadow"), "none");
    await next(user); // Publish
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.customization).toMatchObject({
      layout: "vertical",
      colors: { background: "#fff7ed", accent: "#c2410c" },
      typography: { fontFamily: "mono", fontSize: 16 },
      card: { shadow: "none" },
      button: { style: "filled", size: "medium" },
      spacing: { density: "comfortable" },
    });
    expect(JSON.stringify(body.customization)).not.toMatch(/primaryColor|buttonColor/);
  });

  it("shows the server's message when the design is rejected", async () => {
    fetchMock.mockResolvedValue(
      json(422, {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Bundle validation failed.",
          details: [
            {
              field: "customization.colors.primary",
              code: "INVALID_CUSTOMIZATION",
              message: "Colors must be in #RRGGBB format.",
            },
          ],
        },
      }),
    );
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);
    await toDesignStep(user);
    await next(user);
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Colors must be in #RRGGBB format.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("accessibility of the design step", () => {
  it("has no axe violations with the preview showing", async () => {
    const user = userEvent.setup();
    const { container } = render(<BundleWizard templates={TEMPLATES} />);
    await toDesignStep(user);
    const results = await axe.run(container, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
      },
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`),
    ).toEqual([]);
  });
});
