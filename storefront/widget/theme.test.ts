import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CUSTOMIZATION } from "@/lib/customization/defaults";
import { resolveTheme } from "@/lib/customization/theme";
import type { BundleCustomization } from "@/lib/customization/types";
import { mountBundle } from "./bundle";
import { mountListing } from "./listing";
import { makeBundle, makeCard, makeContext } from "./testing";

let container: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement("div");
  document.body.append(container);
});

const custom: BundleCustomization = {
  layout: "vertical",
  colors: {
    primary: "#112233",
    button: "#445566",
    background: "#ffeecc",
    accent: "#778899",
    text: "#223344",
  },
  typography: { fontFamily: "serif", fontSize: 20, titleSize: "large", descriptionSize: "small" },
  card: { borderRadius: "large", shadow: "strong" },
  button: { style: "outline", size: "large" },
  spacing: { density: "compact" },
};

const declarations = (element: HTMLElement) =>
  (element.getAttribute("style") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(":")[0].trim());

describe("product page widget wears the customization", () => {
  it("sets every theme variable and the layout and button style attributes", () => {
    mountBundle(container, makeBundle({ customization: custom }), makeContext().ctx);
    const root = container.querySelector<HTMLElement>(".bc-widget")!;
    const expected = resolveTheme(custom);
    for (const [name, value] of Object.entries(expected.variables)) {
      expect(root.style.getPropertyValue(name), name).toBe(value);
    }
    expect(root.dataset.layout).toBe("vertical");
    expect(root.dataset.buttonStyle).toBe("outline");
    expect(root.style.getPropertyValue("--bc-font-size")).toBe("20px");
    expect(root.style.getPropertyValue("--bc-radius")).toBe("20px");
  });

  it("uses the default customization when none, or garbage, arrives", () => {
    for (const customization of [undefined, null, "x", 5, [], {}]) {
      document.body.replaceChildren((container = document.createElement("div")));
      mountBundle(
        container,
        makeBundle({ customization: customization as unknown as BundleCustomization }),
        makeContext().ctx,
      );
      const root = container.querySelector<HTMLElement>(".bc-widget")!;
      expect(root.dataset.layout).toBe("card");
      expect(root.dataset.buttonStyle).toBe("filled");
      expect(root.style.getPropertyValue("--bc-primary")).toBe(
        DEFAULT_CUSTOMIZATION.colors.primary,
      );
      expect(container.querySelector(".bc-title")).not.toBeNull(); // still renders fully
    }
  });

  it("only ever writes --bc- custom properties: no other CSS property, style element or URL", () => {
    mountBundle(container, makeBundle({ customization: custom }), makeContext().ctx);
    const root = container.querySelector<HTMLElement>(".bc-widget")!;
    expect(declarations(root).every((name) => name.startsWith("--bc-"))).toBe(true);
    expect(container.querySelector("style, link, script, iframe")).toBeNull();
    expect(container.innerHTML).not.toMatch(/url\(|expression\(|javascript:/i);
  });

  it("hostile values cannot inject CSS, markup or script", () => {
    const evil = {
      layout: "card;} *{display:none}",
      colors: {
        primary: "red;} body{display:none} /*",
        button: "url(javascript:alert(1))",
        background: "</style><script>window.__pwned=1</script>",
        accent: "var(--evil)",
        text: "expression(alert(1))",
      },
      typography: {
        fontFamily: "x;}@import url(https://evil.example/f.css)",
        fontSize: "16px;}",
        titleSize: "<img src=x onerror=alert(1)>",
        descriptionSize: "1e9px",
      },
      card: { borderRadius: "0;}", shadow: "0 0 9px red" },
      button: { style: "filled;}", size: "\u0000" },
      spacing: { density: "1000rem" },
      css: "body{display:none}",
    } as unknown as BundleCustomization;
    mountBundle(container, makeBundle({ customization: evil }), makeContext().ctx);
    const root = container.querySelector<HTMLElement>(".bc-widget")!;
    expect(root.dataset.layout).toBe("card");
    expect(declarations(root).every((name) => name.startsWith("--bc-"))).toBe(true);
    expect(root.getAttribute("style")).not.toMatch(
      /evil|url\(|script|expression|@import|display:none/,
    );
    expect(container.querySelector("script, style, img[onerror]")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    expect(resolveTheme(evil)).toEqual(resolveTheme(DEFAULT_CUSTOMIZATION));
  });

  it("uses the same theme for every layout", () => {
    for (const layout of ["card", "horizontal", "vertical"] as const) {
      document.body.replaceChildren((container = document.createElement("div")));
      mountBundle(
        container,
        makeBundle({ customization: { ...custom, layout } }),
        makeContext().ctx,
      );
      expect(container.querySelector<HTMLElement>(".bc-widget")!.dataset.layout).toBe(layout);
    }
  });
});

describe("landing page cards wear the same customization", () => {
  it("applies the theme to each card from its own bundle", () => {
    const second = {
      ...custom,
      layout: "horizontal",
      colors: { ...custom.colors, button: "#ab1234" },
    } as BundleCustomization;
    mountListing(
      container,
      [
        makeCard({ customization: custom }),
        makeCard({
          id: "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a12",
          name: "Second",
          customization: second,
        }),
      ],
      makeContext().ctx,
    );
    const [a, b] = [...container.querySelectorAll<HTMLElement>(".bc-bundle-card")];
    for (const [name, value] of Object.entries(resolveTheme(custom).variables)) {
      expect(a.style.getPropertyValue(name), name).toBe(value);
    }
    expect(a.dataset.layout).toBe("vertical");
    expect(a.dataset.buttonStyle).toBe("outline");
    expect(b.dataset.layout).toBe("horizontal");
    expect(b.style.getPropertyValue("--bc-button")).toBe("#ab1234");
  });

  it("the card call to action wears the button style, and the card falls back to defaults", () => {
    mountListing(
      container,
      [makeCard({ customization: undefined as unknown as BundleCustomization })],
      makeContext().ctx,
    );
    const card = container.querySelector<HTMLElement>(".bc-bundle-card")!;
    expect(card.dataset.layout).toBe("card");
    expect(card.dataset.buttonStyle).toBe("filled");
    const toggle = card.querySelector<HTMLButtonElement>("button[aria-controls]")!;
    expect(toggle.classList.contains("bc-button")).toBe(true);
  });

  it("hostile card customization is neutralised too", () => {
    mountListing(
      container,
      [
        makeCard({
          customization: {
            ...custom,
            colors: { ...custom.colors, primary: "red;background:url(x)" },
          },
        }),
      ],
      makeContext().ctx,
    );
    const card = container.querySelector<HTMLElement>(".bc-bundle-card")!;
    expect(card.style.getPropertyValue("--bc-primary")).toBe(DEFAULT_CUSTOMIZATION.colors.primary);
    expect(card.getAttribute("style")).not.toMatch(/url\(/);
  });
});
