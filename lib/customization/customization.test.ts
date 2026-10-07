import { describe, expect, it } from "vitest";
import { contrastRatio, contrastWarnings, DARK_TEXT, LIGHT_TEXT, readableTextOn } from "./contrast";
import { DEFAULT_CUSTOMIZATION, cloneDefaultCustomization } from "./defaults";
import { sanitizeCustomization } from "./sanitize";
import { resolveTheme } from "./theme";
import type { BundleCustomization } from "./types";
import { mergeCustomization, parseCustomization, validateCustomization } from "./validation";

/** A customization typed loosely so a test can put wrong values in it. */
type Loose = Record<string, Record<string, unknown> & unknown> & { layout?: unknown };

const valid = (): BundleCustomization => ({
  layout: "horizontal",
  colors: {
    primary: "#112233",
    button: "#445566",
    background: "#ffeecc",
    accent: "#778899",
    text: "#223344",
  },
  typography: { fontFamily: "serif", fontSize: 18, titleSize: "large", descriptionSize: "small" },
  card: { borderRadius: "large", shadow: "subtle" },
  button: { style: "outline", size: "large" },
  spacing: { density: "compact" },
});

const fields = (issues: { field: string }[]) => issues.map((issue) => issue.field);

describe("defaults", () => {
  it("are themselves valid, complete and independent copies", () => {
    expect(validateCustomization(DEFAULT_CUSTOMIZATION)).toEqual([]);
    const copy = cloneDefaultCustomization();
    copy.colors.primary = "#000000";
    expect(DEFAULT_CUSTOMIZATION.colors.primary).toBe("#111827");
  });
});

describe("validation", () => {
  it("accepts a complete valid customization", () => {
    expect(validateCustomization(valid())).toEqual([]);
  });

  it("accepts every documented option value", () => {
    for (const layout of ["card", "horizontal", "vertical"] as const) {
      expect(validateCustomization({ ...valid(), layout })).toEqual([]);
    }
    for (const fontFamily of ["theme", "sans", "serif", "mono"] as const) {
      const c = valid();
      c.typography.fontFamily = fontFamily;
      expect(validateCustomization(c)).toEqual([]);
    }
    for (const size of ["small", "medium", "large"] as const) {
      const c = valid();
      c.typography.titleSize = size;
      c.typography.descriptionSize = size;
      c.button.size = size;
      expect(validateCustomization(c)).toEqual([]);
    }
    for (const borderRadius of ["none", "small", "medium", "large"] as const) {
      const c = valid();
      c.card.borderRadius = borderRadius;
      expect(validateCustomization(c)).toEqual([]);
    }
    for (const shadow of ["none", "subtle", "strong"] as const) {
      const c = valid();
      c.card.shadow = shadow;
      expect(validateCustomization(c)).toEqual([]);
    }
    for (const style of ["filled", "outline"] as const) {
      const c = valid();
      c.button.style = style;
      expect(validateCustomization(c)).toEqual([]);
    }
    for (const density of ["compact", "comfortable"] as const) {
      const c = valid();
      c.spacing.density = density;
      expect(validateCustomization(c)).toEqual([]);
    }
  });

  it.each([
    ["rgb()", "rgb(0,0,0)"],
    ["rgba()", "rgba(0,0,0,.5)"],
    ["hsl()", "hsl(0,0%,0%)"],
    ["url()", "url(https://evil.example/x.png)"],
    ["a CSS variable", "var(--anything)"],
    ["an expression", "expression(alert(1))"],
    ["a named color", "red"],
    ["a keyword", "transparent"],
    ["short hex", "#fff"],
    ["hex with alpha", "#11223344"],
    ["no hash", "112233"],
    ["a non-hex digit", "#11223g"],
    ["trailing declarations", "#112233;background:url(x)"],
    ["a closing brace and style tag", "#000000;}</style><script>alert(1)</script>"],
    ["an empty string", ""],
    ["whitespace around", " #112233 "],
    ["a number", 123456],
    ["null", null],
    ["an object", { toString: () => "#112233" }],
  ])("rejects %s as a color", (_name, bad) => {
    for (const key of ["primary", "button", "background", "accent", "text"] as const) {
      const c = valid();
      (c.colors as Record<string, unknown>)[key] = bad;
      expect(fields(validateCustomization(c)), key).toEqual([`customization.colors.${key}`]);
    }
  });

  it("rejects unknown layouts, options, sizes and non-strings", () => {
    const bad = (mutate: (c: Loose) => void) => {
      const c = valid() as unknown as Loose;
      mutate(c);
      return fields(validateCustomization(c));
    };
    expect(bad((c) => (c.layout = "carousel"))).toEqual(["customization.layout"]);
    expect(bad((c) => (c.layout = "CARD"))).toEqual(["customization.layout"]);
    expect(bad((c) => (c.layout = ["card"]))).toEqual(["customization.layout"]);
    expect(bad((c) => (c.typography.fontFamily = "Comic Sans MS"))).toEqual([
      "customization.typography.fontFamily",
    ]);
    expect(bad((c) => (c.typography.fontFamily = "https://evil.example/font.css"))).toEqual([
      "customization.typography.fontFamily",
    ]);
    expect(bad((c) => (c.typography.titleSize = "huge"))).toEqual([
      "customization.typography.titleSize",
    ]);
    expect(bad((c) => (c.card.borderRadius = "50%"))).toEqual(["customization.card.borderRadius"]);
    expect(bad((c) => (c.card.shadow = "0 0 10px red"))).toEqual(["customization.card.shadow"]);
    expect(bad((c) => (c.button.style = "ghost"))).toEqual(["customization.button.style"]);
    expect(bad((c) => (c.button.size = "xl"))).toEqual(["customization.button.size"]);
    expect(bad((c) => (c.spacing.density = "tight"))).toEqual(["customization.spacing.density"]);
  });

  it.each([11, 25, 0, -1, 16.5, Number.NaN, Infinity, "16", "16px", null, 9000])(
    "rejects %s as a font size",
    (size) => {
      const c = valid();
      (c.typography as Record<string, unknown>).fontSize = size;
      expect(fields(validateCustomization(c))).toEqual(["customization.typography.fontSize"]);
    },
  );

  it("accepts the font size bounds", () => {
    for (const size of [12, 24]) {
      const c = valid();
      c.typography.fontSize = size;
      expect(validateCustomization(c)).toEqual([]);
    }
  });

  it("rejects unknown fields at every level", () => {
    const top = { ...valid(), css: "body{display:none}" };
    expect(validateCustomization(top)).toContainEqual(
      expect.objectContaining({ field: "customization.css", code: "UNKNOWN_FIELD" }),
    );
    const nested = valid();
    (nested.colors as Record<string, unknown>).secondary = "#000000";
    expect(validateCustomization(nested)).toContainEqual(
      expect.objectContaining({ field: "customization.colors.secondary", code: "UNKNOWN_FIELD" }),
    );
    const html = { ...valid(), html: "<script>alert(1)</script>", customCss: ".x{}", script: "1" };
    expect(validateCustomization(html)).toHaveLength(3);
  });

  it("rejects non-objects and missing parts of a complete customization", () => {
    for (const bad of [null, undefined, "card", 5, [], [valid()]]) {
      expect(validateCustomization(bad)).toHaveLength(1);
    }
    expect(fields(validateCustomization({ layout: "card" }))).toEqual(
      expect.arrayContaining(["customization.colors", "customization.typography"]),
    );
    const partial = valid() as unknown as Record<string, Record<string, unknown>>;
    delete partial.colors.accent;
    expect(fields(validateCustomization(partial))).toEqual(["customization.colors.accent"]);
  });

  it("rejects a prototype-pollution attempt as an unknown field", () => {
    const evil = JSON.parse('{"__proto__": {"polluted": true}, "layout": "card"}');
    expect(validateCustomization(evil).some((i) => i.code === "UNKNOWN_FIELD")).toBe(true);
    expect(parseCustomization(evil).ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("parseCustomization (what an API save uses)", () => {
  it("fills missing fields from the defaults", () => {
    const parsed = parseCustomization({ layout: "vertical", colors: { primary: "#123456" } });
    expect(parsed.ok && parsed.value).toEqual({
      ...DEFAULT_CUSTOMIZATION,
      layout: "vertical",
      colors: { ...DEFAULT_CUSTOMIZATION.colors, primary: "#123456" },
    });
  });

  it("fills missing fields from a given base (a merge onto the stored values)", () => {
    const parsed = parseCustomization({ button: { style: "outline" } }, valid());
    expect(parsed.ok && parsed.value).toEqual({
      ...valid(),
      button: { style: "outline", size: "large" },
    });
  });

  it("an empty object means all defaults", () => {
    const parsed = parseCustomization({});
    expect(parsed.ok && parsed.value).toEqual(DEFAULT_CUSTOMIZATION);
  });

  it("fails as a whole: one bad field saves nothing and reports every problem", () => {
    const parsed = parseCustomization({
      colors: { primary: "red", button: "#000000" },
      layout: "grid",
      extra: 1,
    });
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && fields(parsed.issues).sort()).toEqual([
      "customization.colors.primary",
      "customization.extra",
      "customization.layout",
    ]);
  });

  it("does not mutate its inputs", () => {
    const base = valid();
    const patch = { colors: { primary: "#000000" } };
    mergeCustomization(patch, base);
    expect(base.colors.primary).toBe("#112233");
    expect(patch).toEqual({ colors: { primary: "#000000" } });
  });
});

describe("sanitizeCustomization (what the storefront relies on)", () => {
  it("returns valid input unchanged", () => {
    expect(sanitizeCustomization(valid())).toEqual(valid());
  });

  it("replaces only the broken fields with their defaults", () => {
    const c = valid() as unknown as Loose;
    c.colors.primary = "red;} body{display:none} /*";
    c.typography.fontSize = 900;
    c.layout = "carousel";
    const clean = sanitizeCustomization(c);
    expect(clean.colors.primary).toBe(DEFAULT_CUSTOMIZATION.colors.primary);
    expect(clean.typography.fontSize).toBe(16);
    expect(clean.layout).toBe("card");
    expect(clean.colors.button).toBe("#445566"); // the merchant's valid choices survive
    expect(clean.card.borderRadius).toBe("large");
    expect(validateCustomization(clean)).toEqual([]);
  });

  it.each([null, undefined, "x", 5, [], true, () => 1])("never throws for %s", (garbage) => {
    expect(sanitizeCustomization(garbage)).toEqual(DEFAULT_CUSTOMIZATION);
  });

  it("drops unknown fields instead of passing them on", () => {
    const clean = sanitizeCustomization({
      ...valid(),
      css: "x",
      colors: { ...valid().colors, evil: "1" },
    });
    expect(JSON.stringify(clean)).not.toContain("evil");
    expect(Object.keys(clean).sort()).toEqual(
      ["button", "card", "colors", "layout", "spacing", "typography"].sort(),
    );
  });

  it("output always satisfies the strict rules (property check over hostile values)", () => {
    const hostile = [
      "#000;}",
      "url(x)",
      "javascript:alert(1)",
      "<script>",
      "expression(1)",
      "var(--x)",
      -1,
      1e9,
      {},
      [],
      null,
    ];
    for (const value of hostile) {
      const raw = {
        layout: value,
        colors: { primary: value, button: value, background: value, accent: value, text: value },
        typography: {
          fontFamily: value,
          fontSize: value,
          titleSize: value,
          descriptionSize: value,
        },
        card: { borderRadius: value, shadow: value },
        button: { style: value, size: value },
        spacing: { density: value },
      };
      expect(validateCustomization(sanitizeCustomization(raw))).toEqual([]);
    }
  });
});

describe("the theme mapper (the only place customization becomes CSS)", () => {
  const SAFE_VALUE = new RegExp(
    [
      "^#[0-9a-f]{6}$", // colours
      "^\\d{2}px$", // base size
      "^(0|\\d+px)$", // radius
      "^([.\\d]+(em|rem|px)|\\d+)$", // sizes
      "^none$|^0 [^;{}]+$", // shadows
      "^[.\\d]+rem( [.\\d]+rem)?$", // paddings and gaps
      '^inherit$|^[A-Za-z\\-\\s,"]+$', // font stacks
    ].join("|"),
    "i",
  );

  it("maps a customization to constants and validated colors only", () => {
    const theme = resolveTheme(valid());
    expect(theme.layout).toBe("horizontal");
    expect(theme.buttonStyle).toBe("outline");
    expect(theme.variables).toMatchObject({
      "--bc-primary": "#112233",
      "--bc-button": "#445566",
      "--bc-bg": "#ffeecc",
      "--bc-accent": "#778899",
      "--bc-text": "#223344",
      "--bc-font-size": "18px",
      "--bc-title-size": "1.5em",
      "--bc-desc-size": ".875em",
      "--bc-radius": "20px",
      "--bc-shadow": "0 1px 3px rgba(0,0,0,.12)",
      "--bc-pad": ".75rem",
    });
    for (const [name, value] of Object.entries(theme.variables)) {
      expect(name).toMatch(/^--bc-[a-z-]+$/);
      expect(value, name).toMatch(SAFE_VALUE);
    }
  });

  it("hostile input can only ever produce the default theme", () => {
    const evil = {
      layout: "card;} *{display:none}",
      colors: {
        primary: "red;background:url(https://evil.example)",
        button: "expression(alert(1))",
        background: "</style><script>alert(1)</script>",
        accent: "var(--x)",
        text: "\\0041",
      },
      typography: {
        fontFamily: "x;}@import url(//evil)",
        fontSize: "1e9px",
        titleSize: "1px",
        descriptionSize: "}",
      },
      card: { borderRadius: "999px", shadow: "0 0 99px red" },
      button: { style: "filled;", size: "big" },
      spacing: { density: "0" },
    };
    expect(resolveTheme(evil)).toEqual(resolveTheme(DEFAULT_CUSTOMIZATION));
    for (const value of Object.values(resolveTheme(evil).variables)) {
      expect(value).not.toMatch(/evil|url\(|script|expression|@import|[{}<>;]/);
    }
  });

  it("picks a readable label color for any button color", () => {
    for (const button of [
      "#000000",
      "#ffffff",
      "#ffff00",
      "#0000ff",
      "#777777",
      "#ff0000",
      "#00ff00",
    ]) {
      const text = resolveTheme({ ...valid(), colors: { ...valid().colors, button } }).variables[
        "--bc-button-text"
      ];
      expect([LIGHT_TEXT, DARK_TEXT]).toContain(text);
      expect(contrastRatio(text, button), button).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses the default theme when there is no customization", () => {
    expect(resolveTheme(undefined)).toEqual(resolveTheme(DEFAULT_CUSTOMIZATION));
    expect(resolveTheme(undefined).variables["--bc-font-family"]).toBe("inherit");
  });

  it("only offers system font stacks, never a web font", () => {
    for (const fontFamily of ["theme", "sans", "serif", "mono"] as const) {
      const stack = resolveTheme({ ...valid(), typography: { ...valid().typography, fontFamily } })
        .variables["--bc-font-family"];
      expect(stack).not.toMatch(/url|http|@import|\/\//i);
    }
  });
});

describe("contrast helpers", () => {
  it("computes WCAG ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThan(4.5);
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(4.6);
  });

  it("warns about hard-to-read combinations and stays quiet for good ones", () => {
    const good = { ...DEFAULT_CUSTOMIZATION.colors };
    expect(contrastWarnings(good, "filled")).toEqual([]);
    const poor = { ...good, text: "#dddddd", primary: "#eeeeee", accent: "#f5f5f5" };
    expect(contrastWarnings(poor, "filled").map((w) => w.field)).toEqual([
      "text",
      "primary",
      "accent",
    ]);
    // A pale button only matters when the button is an outline (its label is the button color).
    const pale = { ...good, button: "#eeeeee" };
    expect(contrastWarnings(pale, "filled")).toEqual([]);
    expect(contrastWarnings(pale, "outline").map((w) => w.field)).toEqual(["button"]);
  });

  it("readableTextOn ignores malformed colors safely", () => {
    expect(readableTextOn("not-a-color")).toBe(LIGHT_TEXT);
  });
});
