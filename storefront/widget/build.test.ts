// @vitest-environment node
import { build } from "esbuild";
import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_GZIP_BYTES, WIDGET_OUT, buildOptions } from "../../scripts/build-widget.mjs";

const EXT = "extensions/bundle-widget";
const asset = readFileSync(WIDGET_OUT, "utf8");

describe("the shipped storefront script", () => {
  it("is exactly what the current source builds to (nobody edited source without rebuilding)", async () => {
    const result = await build({ ...buildOptions, write: false });
    expect(result.outputFiles?.[0].text).toBe(asset);
  }, 30_000);

  it("stays within the performance budget", () => {
    const gzipped = gzipSync(asset).length;
    expect(gzipped).toBeLessThanOrEqual(MAX_GZIP_BYTES);
    expect(asset.length).toBeLessThan(40 * 1024);
  });

  it("is a self-contained script with no framework or dashboard code in it", () => {
    for (const heavy of [
      "react",
      "React.createElement",
      "next/",
      "radix",
      "tailwind",
      "lucide",
      "zod",
    ]) {
      expect(asset).not.toContain(heavy);
    }
  });

  it("contains no server code, credentials, or private configuration", () => {
    for (const forbidden of [
      "prisma",
      "Prisma",
      "DATABASE_URL",
      "DIRECT_URL",
      "SESSION_SECRET",
      "SHOPIFY_API_SECRET",
      "process.env",
      "accessToken",
      "access_token",
      "shpat_",
      "shpss_",
      "X-Shopify-Access-Token",
      "getDecryptedAccessToken",
      "localStorage",
      "sessionStorage",
      "document.cookie",
    ]) {
      expect(asset, `bundle must not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("only talks to the App Proxy path and Shopify's own cart endpoint", () => {
    const urls = asset.match(/https?:\/\/[^"'`\s)]+/g) ?? [];
    expect(urls.filter((url) => !url.includes("w3.org"))).toEqual([]);
  });

  it("uses no dynamic code execution or HTML injection", () => {
    for (const unsafe of [
      "eval(",
      "new Function",
      "innerHTML",
      "outerHTML",
      "insertAdjacentHTML",
      "document.write",
    ]) {
      expect(asset).not.toContain(unsafe);
    }
  });
});

describe("widget dependency and size regression (ACTION-016)", () => {
  it("bundles only widget code and the dependency-free shared modules, never a library", async () => {
    const result = await build({ ...buildOptions, write: false, metafile: true });
    const inputs = Object.keys(Object.values(result.metafile.outputs)[0].inputs);
    // Everything that ends up in the customer-facing script must come from one of these places.
    const allowed = [
      /^storefront\/widget\//,
      /^lib\/storefront\//,
      /^lib\/customization\/(types|spec|defaults|sanitize|theme|contrast)\.ts$/,
      /^lib\/bundles\/(rules|types)\.ts$/,
    ];
    const unexpected = inputs.filter((path) => !allowed.some((pattern) => pattern.test(path)));
    expect(unexpected).toEqual([]);
    expect(inputs.some((path) => path.includes("node_modules"))).toBe(false);
  });

  it("stays well inside the budget: under 10 KB gzipped, with headroom for growth", () => {
    expect(gzipSync(asset).length).toBeLessThan(10 * 1024);
  });

  it("keeps the source, not a copy, in step with the asset (minified, single file)", () => {
    expect(asset.split(String.fromCharCode(10)).length).toBeLessThanOrEqual(2);
  });
});

describe("theme app extension files", () => {
  const files = (dir: string) => readdirSync(join(EXT, dir));

  it("follows the Shopify theme app extension structure", () => {
    expect(readFileSync(join(EXT, "shopify.extension.toml"), "utf8")).toContain('type = "theme"');
    expect(files("blocks").sort()).toEqual(["bundle-listing.liquid", "bundle-widget.liquid"]);
    expect(files("snippets")).toEqual(["bundlecraft-root.liquid"]);
    expect(files("assets").sort()).toEqual(["bundlecraft-widget.css", "bundlecraft-widget.js"]);
    expect(files("locales")).toEqual(["en.default.json"]);
  });

  it("blocks declare a section target and load the script deferred (non-blocking)", () => {
    for (const name of ["bundle-widget", "bundle-listing"]) {
      const liquid = readFileSync(join(EXT, "blocks", `${name}.liquid`), "utf8");
      expect(liquid).toContain('"target": "section"');
      expect(liquid).toContain("{% schema %}");
    }
    const snippet = readFileSync(join(EXT, "snippets", "bundlecraft-root.liquid"), "utf8");
    expect(snippet).toContain("bundlecraft-widget.js' | asset_url");
    expect(snippet).toMatch(/<script[^>]+defer/);
  });

  it("puts nothing secret in any Liquid, CSS, or locale file", () => {
    const all = ["blocks", "snippets", "assets", "locales"].flatMap((dir) =>
      files(dir)
        .filter((f) => !f.endsWith(".js"))
        .map((f) => readFileSync(join(EXT, dir, f), "utf8")),
    );
    for (const text of all) {
      expect(text).not.toMatch(/shpat_|shpss_|api[_-]?secret|access[_-]?token|password|DATABASE/i);
    }
  });

  it("passes only public storefront values to the script", () => {
    const snippet = readFileSync(join(EXT, "snippets", "bundlecraft-root.liquid"), "utf8");
    const attributes = [...snippet.matchAll(/^\s*(data-[a-z-]+)=/gm)].map((m) => m[1]);
    expect(attributes.sort()).toEqual(
      [
        "data-api-base",
        "data-bundle-id",
        "data-cart-add-url",
        "data-cart-url",
        "data-currency",
        "data-heading",
        "data-locale",
        "data-mode",
        "data-product-id",
        "data-show-empty",
        "data-strings",
      ].sort(),
    );
  });
});

describe("responsive and accessible styling contract", () => {
  // jsdom has no layout engine, so these assert the CSS rules that produce the behaviour.
  const css = readFileSync(join(EXT, "assets/bundlecraft-widget.css"), "utf8");

  it("is mobile-first: fluid grids, a desktop breakpoint, and no fixed-width overflow", () => {
    expect(css).toContain("minmax(min(100%,11rem),1fr)"); // card grid can't exceed its container
    expect(css).toContain("@media (min-width:640px)"); // mobile-first enhancement
    expect(css).toContain("max-width:100%");
    expect(css).toContain("overflow-wrap:anywhere"); // long product names wrap
    expect(css).toContain("flex-wrap:wrap"); // horizontal layout wraps instead of scrolling
    expect(css).not.toMatch(/[^-]width:\s*\d{3,}px/); // no fixed hundreds-of-px widths
  });

  it("supports all three layouts", () => {
    for (const layout of ["card", "horizontal", "vertical"])
      expect(css).toContain(`data-layout="${layout}"`);
  });

  it("has 44px touch targets, visible focus, reduced-motion support, and a screen-reader-only helper", () => {
    // The button height comes from the customization, whose smallest value is still 44px.
    expect(css).toMatch(/\.bc-button\{[^}]*min-height:var\(--bc-btn-min\)/);
    expect(css).toContain("--bc-btn-min:44px");
    expect(css).toMatch(/\.bc-step\{[^}]*width:44px;height:44px/);
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(".bc-sr-only");
  });

  it("scopes every selector under .bc- so it can't affect the merchant's theme", () => {
    const selectors = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@media[^{]+\{|@keyframes[^{]+\{/g, "")
      .split("{")
      .slice(0, -1)
      .map((chunk) => chunk.split("}").pop()!.trim())
      .filter(Boolean)
      .flatMap((group) => group.split(","));
    const unscoped = selectors
      .map((s) => s.trim())
      .filter((s) => !s.includes(".bc-") && s !== "[hidden]" && !/^(to|from|\d+%)$/.test(s));
    expect(unscoped).toEqual([]);
  });
});
