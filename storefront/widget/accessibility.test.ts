import axe from "axe-core";
import { DEFAULT_CUSTOMIZATION } from "@/lib/customization/defaults";
import { beforeEach, describe, expect, it } from "vitest";
import { mountBundle } from "./bundle";
import { mountListing } from "./listing";
import { errorState, emptyState, listingSkeleton, loadingState } from "./states";
import { makeBundle, makeCard, makeConfig, makeContext, product, variant } from "./testing";

let container: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement("div");
  document.body.append(container);
});

async function violations(node: HTMLElement): Promise<string[]> {
  const results = await axe.run(node, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
    rules: {
      "color-contrast": { enabled: false }, // needs layout; the theme's own colours apply on a store
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
    },
  });
  return results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(" | ")})`,
  );
}

const HOSTILE = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>`;

describe("storefront widget accessibility (axe-core, WCAG 2.1 A/AA)", () => {
  it("fixed bundle, with variants and a sold-out product", async () => {
    const { ctx } = makeContext();
    mountBundle(
      container,
      makeBundle({
        products: [
          product("11", { variants: [variant("11", "S"), variant("12", "M")] }),
          product("21", { variants: [variant("21", "Only", { available: false })] }),
          product("31"),
        ],
      }),
      ctx,
    );
    expect(await violations(container)).toEqual([]);
  });

  it("quantity and mix & match bundles (steppers and selection state)", async () => {
    for (const [type, requiredQuantity] of [
      ["quantity", 3],
      ["mix_match", 2],
    ] as const) {
      container.replaceChildren();
      const { ctx } = makeContext();
      mountBundle(container, makeBundle({ type, requiredQuantity }), ctx);
      expect(await violations(container), type).toEqual([]);
    }
  });

  it("listing, loading, empty and error states", async () => {
    const { ctx } = makeContext();
    mountListing(
      container,
      [
        makeCard({
          description: "Everything for the look.",
          preview: [
            { title: "Shirt", imageUrl: "https://cdn.shopify.com/s/files/a.jpg" },
            { title: "Scarf", imageUrl: null },
          ],
          productCount: 6,
        }),
        makeCard({
          id: "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a12",
          name: "Mix your own",
          type: "mix_match",
          requiredQuantity: 3,
          pricing: null,
        }),
        makeCard({
          id: "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a13",
          name: "Gone",
          availability: "sold_out",
        }),
        makeCard({
          id: "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a14",
          name: "Retired",
          availability: "unavailable",
        }),
      ],
      ctx,
    );
    expect(await violations(container)).toEqual([]);

    const config = makeConfig();
    for (const node of [
      loadingState(config),
      listingSkeleton(config),
      emptyState(config),
      errorState(config, "Something went wrong.", () => {}),
    ]) {
      container.replaceChildren(node);
      expect(await violations(container)).toEqual([]);
    }
  });

  it("customized widgets and cards (every layout, outline buttons, all sizes)", async () => {
    for (const layout of ["card", "horizontal", "vertical"] as const) {
      container.replaceChildren();
      const { ctx } = makeContext();
      const customization = {
        ...DEFAULT_CUSTOMIZATION,
        layout,
        colors: { ...DEFAULT_CUSTOMIZATION.colors, button: "#1e40af", accent: "#b91c1c" },
        typography: {
          fontFamily: "serif",
          fontSize: 20,
          titleSize: "large",
          descriptionSize: "small",
        },
        button: { style: "outline", size: "large" },
        spacing: { density: "compact" },
      } as const;
      mountBundle(container, makeBundle({ customization }), ctx);
      mountListing(container, [makeCard({ customization })], ctx);
      expect(await violations(container), layout).toEqual([]);
    }
  });

  it("every control is a real, named, keyboard-reachable element", () => {
    const { ctx } = makeContext();
    mountBundle(container, makeBundle({ type: "quantity", requiredQuantity: 3 }), ctx);
    const controls = container.querySelectorAll("button, input, select, a[href]");
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      const name =
        control.getAttribute("aria-label") ??
        control.textContent?.trim() ??
        container.querySelector(`label[for="${control.id}"]`)?.textContent;
      expect(name, control.outerHTML).toBeTruthy();
      expect(control.getAttribute("tabindex")).not.toBe("-1");
    }
    expect(container.querySelector("[onclick]")).toBeNull(); // no click-only <div>s
  });
});

describe("storefront widget renders merchant and Shopify text as text (XSS)", () => {
  it("bundle name, description and product titles never become markup", () => {
    const { ctx } = makeContext();
    (window as unknown as { __xss?: number }).__xss = undefined;
    mountBundle(
      container,
      makeBundle({
        name: HOSTILE,
        description: HOSTILE,
        products: [
          product("11", { title: HOSTILE, variants: [variant("11", HOSTILE)] }),
          product("21"),
          product("31"),
        ],
      }),
      ctx,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<img src=x");
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it("only https or same-site image URLs are ever used", () => {
    const { ctx } = makeContext();
    mountBundle(
      container,
      makeBundle({
        products: [
          product("11", { imageUrl: "javascript:alert(1)" }),
          product("21", { imageUrl: "data:text/html,<script>alert(1)</script>" }),
          product("31", { imageUrl: "https://cdn.shopify.com/ok.png" }),
        ],
      }),
      ctx,
    );
    const sources = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(sources).toEqual(["https://cdn.shopify.com/ok.png?width=400"]);
  });

  it("customization values from the server cannot inject CSS or script", () => {
    const { ctx } = makeContext();
    mountBundle(
      container,
      makeBundle({
        customization: {
          layout: "card",
          colors: {
            ...DEFAULT_CUSTOMIZATION.colors,
            primary: "red;} body{display:none} /*",
            button: "#000000",
            background: "#ffffff",
          },
          typography: { ...DEFAULT_CUSTOMIZATION.typography, fontSize: 16 },
          card: DEFAULT_CUSTOMIZATION.card,
          button: DEFAULT_CUSTOMIZATION.button,
          spacing: DEFAULT_CUSTOMIZATION.spacing,
        },
      }),
      ctx,
    );
    expect(container.innerHTML).not.toContain("display:none");
  });
});
