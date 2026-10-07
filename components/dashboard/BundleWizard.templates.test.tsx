import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { templateFixture } from "@/lib/templates/testing";
import type { TemplateDto } from "@/lib/templates/types";
import { BundleWizard } from "./BundleWizard";
import { INITIAL_WIZARD_STATE, applyTemplate } from "./wizard/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/bundles/create",
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const TEMPLATES = [
  templateFixture("complete-look", "t-look"),
  templateFixture("weekend-outfit", "t-weekend"),
  templateFixture("seasonal-collection", "t-season"),
  templateFixture("skincare-routine", "t-skin"),
  templateFixture("hair-care-kit", "t-hair"),
];

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

const next = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Next" }));

describe("template selection", () => {
  it("lists the five templates grouped under Fashion and Beauty", () => {
    render(<BundleWizard templates={TEMPLATES} />);
    const fashion = screen.getByRole("radiogroup", { name: "Fashion templates" });
    const beauty = screen.getByRole("radiogroup", { name: "Beauty templates" });
    expect(
      within(fashion)
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toEqual([
      expect.stringContaining("Complete Look"),
      expect.stringContaining("Weekend Outfit"),
      expect.stringContaining("Seasonal Collection"),
    ]);
    expect(within(beauty).getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 3, name: "Fashion" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Beauty" })).toBeInTheDocument();
  });

  it("previews a template without changing the bundle, and needs no Shopify products", async () => {
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);

    await user.click(screen.getByRole("radio", { name: /Skincare Routine/ }));

    const preview = screen.getByRole("region", { name: "Skincare Routine" });
    expect(within(preview).getByText(/Best when the products are meant/)).toBeInTheDocument();
    expect(within(preview).getByText("Cleanser")).toBeInTheDocument();
    expect(within(preview).getByText("SPF")).toBeInTheDocument();
    expect(within(preview).getByText(/about 4 products/)).toBeInTheDocument();
    expect(within(preview).getByText("15% off")).toBeInTheDocument();
    expect(within(preview).queryByRole("img")).toBeNull(); // no invented product photos
    // Nothing applied yet: Next stays locked and no product request was made.
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("applies the template defaults, which the merchant can then change", async () => {
    fetchMock.mockResolvedValue(json(201, { success: true, data: { bundle: { id: "b1" } } }));
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);

    await user.click(screen.getByRole("radio", { name: /Seasonal Collection/ }));
    await user.click(screen.getByRole("button", { name: "Use this template" }));

    // Seasonal Collection is a mix & match template: type and quantity are filled in.
    expect(screen.getByRole("radio", { name: "Mix & match" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("Required quantity")).toHaveValue("3");
    expect(screen.getByRole("status")).toHaveTextContent("Template applied");

    // The merchant is free to change it.
    await user.click(screen.getByRole("radio", { name: "Quantity" }));
    await user.clear(screen.getByLabelText("Required quantity"));
    await user.type(screen.getByLabelText("Required quantity"), "5");
    await next(user); // Products
    await next(user); // Discount
    expect(screen.getByLabelText("Percentage off")).toHaveValue("20");
    await user.clear(screen.getByLabelText("Percentage off"));
    await user.type(screen.getByLabelText("Percentage off"), "12");
    await next(user); // Design
    await next(user); // Publish
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      templateId: "t-season",
      title: "Seasonal Collection",
      bundleType: "quantity", // changed by the merchant
      requiredQuantity: 5,
      discountType: "percentage",
      discountValue: 12,
    });
    // Design defaults travel with the bundle, so the storefront needs no template knowledge.
    expect(body.customization).toMatchObject({
      layout: "vertical",
      colors: { background: "#fff7ed" },
    });
    expect(Object.keys(body).sort()).toEqual(
      [
        "bundleType",
        "customization",
        "discountType",
        "discountValue",
        "products",
        "requiredQuantity",
        "templateId",
        "title",
      ].sort(),
    );
    expect(body.products).toEqual([]);
  });

  it("switching template replaces type, discount and design but keeps the merchant's products and name", () => {
    const state = {
      ...INITIAL_WIZARD_STATE,
      title: "My name",
      products: [
        {
          shopifyProductId: "1",
          shopifyVariantId: "11",
          quantity: 2,
          title: "Shirt",
          variantTitle: null,
          imageUrl: null,
          price: "20.00",
        },
      ],
    };
    const applied = applyTemplate(state, TEMPLATES[2]);
    expect(applied.templateId).toBe("t-season");
    expect(applied.bundleType).toBe("mix_match");
    expect(applied.requiredQuantity).toBe("3");
    expect(applied.discountValue).toBe("20");
    expect(applied.title).toBe("My name");
    expect(applied.products).toEqual(state.products);

    const fixed = applyTemplate(applied, TEMPLATES[0]);
    expect(fixed.bundleType).toBe("fixed");
    expect(fixed.requiredQuantity).toBe("");
  });

  it("every catalog template applies to a valid starting state", () => {
    for (const template of TEMPLATES) {
      const applied = applyTemplate(INITIAL_WIZARD_STATE, template);
      expect(["fixed", "quantity", "mix_match"]).toContain(applied.bundleType);
      expect(Number(applied.discountValue)).toBeGreaterThan(0);
    }
  });

  it("shows a friendly message when no templates are available", () => {
    render(<BundleWizard templates={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("No templates are available");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});

describe("existing bundles", () => {
  it("a bundle without a template can still be edited step by step", async () => {
    const user = userEvent.setup();
    render(
      <BundleWizard
        templates={TEMPLATES}
        bundleId="b1"
        initialState={{ ...INITIAL_WIZARD_STATE, title: "Old bundle", discountValue: "10" }}
      />,
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    for (let i = 0; i < 4; i++) await next(user);
    expect(screen.getByText("None (not started from a template)")).toBeInTheDocument();
  });

  it("names a retired template, keeps it, and does not offer it for selection", async () => {
    const user = userEvent.setup();
    render(
      <BundleWizard
        templates={TEMPLATES.slice(1)}
        bundleId="b1"
        retiredTemplateName="Complete Look"
        initialState={{ ...INITIAL_WIZARD_STATE, templateId: "t-look", discountValue: "10" }}
      />,
    );
    expect(screen.getByText(/“Complete Look”, which is no longer offered/)).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Complete Look/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    for (let i = 0; i < 4; i++) await next(user);
    expect(screen.getByText("Complete Look")).toBeInTheDocument();
  });

  it("marks the template a bundle already uses as in use, and previews it", () => {
    render(
      <BundleWizard
        templates={TEMPLATES}
        bundleId="b1"
        initialState={{ ...INITIAL_WIZARD_STATE, templateId: "t-skin", discountValue: "10" }}
      />,
    );
    expect(screen.getByRole("radio", { name: /Skincare Routine/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText("In use")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset to template defaults" })).toBeInTheDocument();
  });
});

describe("untrusted template text", () => {
  it("renders markup in template text as plain text", async () => {
    const evil = "<img src=x onerror=alert(1)><script>alert(2)</script>";
    const template: TemplateDto = {
      ...TEMPLATES[0],
      name: evil,
      description: evil,
      intendedUse: evil,
      sections: [{ key: "top", label: evil, hint: evil }],
    };
    const user = userEvent.setup();
    const { container } = render(<BundleWizard templates={[template]} />);
    await user.click(screen.getByRole("radio", { name: new RegExp("onerror") }));

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(container.textContent).toContain(evil);
  });
});

describe("accessibility of the template step", () => {
  const violations = async (node: HTMLElement) =>
    (
      await axe.run(node, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
        },
        rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
      })
    ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);

  it("has no axe violations before and after previewing", async () => {
    const user = userEvent.setup();
    const { container } = render(<BundleWizard templates={TEMPLATES} />);
    expect(await violations(container)).toEqual([]);
    await user.click(screen.getByRole("radio", { name: /Hair Care Kit/ }));
    expect(await violations(container)).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Use this template" }));
    expect(await violations(container)).toEqual([]);
  });

  it("works from the keyboard: focus a card, press Space, then activate the button", async () => {
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);
    screen.getByRole("radio", { name: /Weekend Outfit/ }).focus();
    await user.keyboard(" ");
    expect(screen.getByRole("region", { name: "Weekend Outfit" })).toBeInTheDocument();
    const use = screen.getByRole("button", { name: "Use this template" });
    use.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("selected state and headings are exposed to assistive technology", async () => {
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);
    const radios = screen
      .getAllByRole("radio")
      .filter((r) => /Look|Outfit|Collection|Routine|Kit/.test(r.textContent ?? ""));
    expect(radios.every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
    await user.click(screen.getByRole("radio", { name: /Complete Look/ }));
    expect(screen.getByRole("radio", { name: /Complete Look/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("heading", { level: 3, name: "Complete Look" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: /What to pick/ })).toBeInTheDocument();
  });
});
