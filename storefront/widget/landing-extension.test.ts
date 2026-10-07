// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_STRINGS } from "./config";

const EXT = "extensions/bundle-widget";
const read = (path: string) => readFileSync(join(EXT, path), "utf8");
const snippet = read("snippets/bundlecraft-root.liquid");
const css = read("assets/bundlecraft-widget.css");
const locale = JSON.parse(read("locales/en.default.json")) as {
  bundlecraft: Record<string, string>;
};

describe("landing page block and translations", () => {
  it("passes the landing page strings through locale keys whose text matches the built-in default", () => {
    const passed = new Map(
      [...snippet.matchAll(/"(\w+)": \{\{ 'bundlecraft\.(\w+)' \| t \| json \}\}/g)].map((m) => [
        m[1],
        m[2],
      ]),
    );
    const landing = [
      "listingLoading",
      "chooseItems",
      "chooseCount",
      "moreProducts",
      "previewLabel",
      "priceDepends",
      "discountNote",
      "bundleSoldOut",
      "bundleUnavailable",
      "products",
      "bundleTypeFixed",
      "bundleTypeQuantity",
      "bundleTypeMixMatch",
      "viewBundle",
      "hideBundle",
      "empty",
      "retry",
      "error",
      "network",
      "save",
      "regular",
      "bundlePrice",
    ] as const;
    for (const key of landing) {
      expect(passed.has(key), `snippet is missing string "${key}"`).toBe(true);
    }
    for (const [key, localeKey] of passed) {
      expect(key in DEFAULT_STRINGS, `unknown string "${key}"`).toBe(true);
      expect(locale.bundlecraft[localeKey], `locale text for "${key}"`).toBe(
        DEFAULT_STRINGS[key as keyof typeof DEFAULT_STRINGS],
      );
    }
  });

  it("tells visitors without JavaScript that scripts are needed, instead of showing nothing", () => {
    expect(snippet).toMatch(/<noscript>[\s\S]*bundlecraft\.noscript[\s\S]*<\/noscript>/);
    expect(locale.bundlecraft.noscript).toMatch(/JavaScript/);
  });

  it("the landing block has a heading setting only (an empty list always shows a message)", () => {
    const block = read("blocks/bundle-listing.liquid");
    expect(block).toContain('"id": "heading"');
    expect(block).not.toContain("show_when_empty");
    expect(block).toContain("mode: 'listing'");
  });

  it("loads nothing from third parties (no external URLs in Liquid or CSS)", () => {
    for (const text of [snippet, css, read("blocks/bundle-listing.liquid")]) {
      expect(text).not.toMatch(/https?:\/\//);
    }
  });
});

describe("landing page styling contract", () => {
  it("cards form a fluid grid that collapses to one column on small phones", () => {
    expect(css).toContain(".bc-listing{");
    expect(css).toContain("minmax(min(100%,16rem),1fr)");
    expect(css).toContain("@media (max-width:480px){.bc-listing{grid-template-columns:1fr}}");
  });

  it("an opened card takes the full row so the interactive widget has room", () => {
    expect(css).toContain(".bc-listing-item--open{grid-column:1/-1}");
  });

  it("product previews are square, cropped, and cannot overflow the card", () => {
    expect(css).toMatch(/\.bc-preview-item\{[^}]*aspect-ratio:1/);
    expect(css).toMatch(/\.bc-preview-image\{[^}]*object-fit:cover/);
    expect(css).toMatch(/\.bc-preview-item\{[^}]*min-width:0/);
  });

  it("the loading placeholder respects reduced motion", () => {
    expect(css).toMatch(/prefers-reduced-motion:reduce\)\{\.bc-placeholder\{animation:none\}/);
  });

  it("the card's own button is pushed to the bottom without touching buttons inside the opened widget", () => {
    expect(css).toContain(".bc-bundle-card>.bc-button{margin-top:auto}");
  });
});

describe("customization styling contract", () => {
  it("every themed property reads a custom property the widget sets, with a default fallback", () => {
    for (const name of [
      "--bc-primary",
      "--bc-button",
      "--bc-bg",
      "--bc-accent",
      "--bc-text",
      "--bc-button-text",
      "--bc-font-size",
      "--bc-font-family",
      "--bc-title-size",
      "--bc-desc-size",
      "--bc-radius",
      "--bc-radius-inner",
      "--bc-shadow",
      "--bc-pad",
      "--bc-gap",
      "--bc-btn-pad",
      "--bc-btn-size",
      "--bc-btn-min",
    ]) {
      expect(css, `${name} fallback`).toContain(`${name}:`);
      expect(css, `${name} used`).toContain(`var(${name})`);
    }
  });

  it("supports the outline button style and the horizontal and vertical landing layouts", () => {
    expect(css).toContain('[data-button-style="outline"] .bc-button');
    expect(css).toContain('.bc-bundle-card[data-layout="horizontal"]');
    expect(css).toContain('.bc-listing-item:has(>.bc-bundle-card[data-layout="vertical"])');
  });

  it("the horizontal card stacks on narrow screens so it cannot overflow", () => {
    expect(css).toContain(
      '@media (max-width:600px){.bc-bundle-card[data-layout="horizontal"]{display:flex}}',
    );
  });

  it("never loads fonts or other resources", () => {
    expect(css).not.toMatch(/@import|@font-face|url\(/);
  });
});
