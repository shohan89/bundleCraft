import { describe, expect, it } from "vitest";
import { TEMPLATE_CATALOG } from "./catalog";
import { parseTemplateConfiguration, toTemplateDto } from "./config";
import { templateFixture } from "./testing";
import { parseTemplateId, parseTemplateQuery } from "./validation";

const valid = () =>
  structuredClone(TEMPLATE_CATALOG[0].configuration) as unknown as Record<string, unknown>;

describe("the MVP template catalog", () => {
  it("has exactly the five documented templates, in two categories", () => {
    expect(TEMPLATE_CATALOG.map((t) => [t.category, t.name, t.slug])).toEqual([
      ["fashion", "Complete Look", "complete-look"],
      ["fashion", "Weekend Outfit", "weekend-outfit"],
      ["fashion", "Seasonal Collection", "seasonal-collection"],
      ["beauty", "Skincare Routine", "skincare-routine"],
      ["beauty", "Hair Care Kit", "hair-care-kit"],
    ]);
  });

  it("uses fixed, stable ids and unique slugs", () => {
    expect(new Set(TEMPLATE_CATALOG.map((t) => t.id)).size).toBe(5);
    expect(new Set(TEMPLATE_CATALOG.map((t) => t.slug)).size).toBe(5);
    for (const template of TEMPLATE_CATALOG) {
      expect(template.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });

  it("every template is valid and maps to an existing bundle type", () => {
    for (const template of TEMPLATE_CATALOG) {
      const config = parseTemplateConfiguration(template.configuration);
      expect(config, template.slug).not.toBeNull();
      expect(["fixed", "quantity", "mix_match"]).toContain(config!.bundleType);
    }
    expect(TEMPLATE_CATALOG.map((t) => t.configuration.bundleType)).toEqual([
      "fixed",
      "fixed",
      "mix_match",
      "fixed",
      "fixed",
    ]);
  });

  it("holds no Shopify product ids, variant ids, SKUs or merchant data", () => {
    const text = JSON.stringify(TEMPLATE_CATALOG.map((t) => t.configuration));
    expect(text).not.toMatch(/gid:\/\/|shopify|sku|shopId/i);
    expect(text).not.toMatch(/\d{9,}/); // no long numeric ids (colours have at most 6 digits)
  });

  it("only mix & match / quantity templates carry a required quantity", () => {
    for (const template of TEMPLATE_CATALOG) {
      const { bundleType, requiredQuantity } = template.configuration;
      expect(requiredQuantity === null, template.slug).toBe(bundleType === "fixed");
    }
  });
});

describe("template configuration validation", () => {
  it("accepts a valid configuration and returns it unchanged", () => {
    expect(parseTemplateConfiguration(valid())).toEqual(valid());
  });

  it.each([
    ["an unknown field (a forged extra setting)", { ...valid(), status: "active" }],
    ["a product list smuggled in", { ...valid(), products: [{ shopifyVariantId: "1" }] }],
    ["the old sections-only shape", { sections: ["top", "bottom"] }],
    ["null", null],
    ["a string", "complete-look"],
    ["a future version", { ...valid(), version: 2 }],
    ["an unknown bundle type", { ...valid(), bundleType: "volume" }],
    ["an unknown discount type", { ...valid(), discount: { type: "bogo", value: 1 } }],
    ["a percentage over 100", { ...valid(), discount: { type: "percentage", value: 150 } }],
    ["a negative discount", { ...valid(), discount: { type: "percentage", value: -5 } }],
    ["a fixed bundle with a required quantity", { ...valid(), requiredQuantity: 3 }],
    [
      "a mix & match bundle with a zero quantity",
      { ...valid(), bundleType: "mix_match", requiredQuantity: 0 },
    ],
    [
      "a bad colour",
      { ...valid(), customization: { ...(valid().customization as object), primaryColor: "red" } },
    ],
    [
      "a font size out of range",
      { ...valid(), customization: { ...(valid().customization as object), fontSize: 99 } },
    ],
    [
      "an unknown layout",
      { ...valid(), customization: { ...(valid().customization as object), layout: "grid" } },
    ],
    ["no sections", { ...valid(), sections: [] }],
    [
      "duplicate section keys",
      {
        ...valid(),
        sections: [
          { key: "top", label: "Top", hint: "One." },
          { key: "top", label: "Other", hint: "Two." },
        ],
      },
    ],
    [
      "markup in the description",
      { ...valid(), description: "Nice <script>alert(1)</script> look" },
    ],
    [
      "markup in a section label",
      { ...valid(), sections: [{ key: "top", label: "<b>Top</b>", hint: "A top." }] },
    ],
    ["control characters in text", { ...valid(), intendedUse: "Line\u0000break here please" }],
    ["an over-long title", { ...valid(), titleSuggestion: "x".repeat(200) }],
    ["a product count of zero", { ...valid(), suggestedProductCount: 0 }],
  ])("rejects %s", (_name, raw) => {
    expect(parseTemplateConfiguration(raw)).toBeNull();
  });
});

describe("the public template shape", () => {
  it("contains only the fields the wizard needs", () => {
    const dto = templateFixture("skincare-routine", "some-id");
    expect(Object.keys(dto).sort()).toEqual(
      [
        "bundleType",
        "category",
        "defaults",
        "description",
        "id",
        "intendedUse",
        "name",
        "requiredQuantity",
        "sections",
        "slug",
        "suggestedProductCount",
      ].sort(),
    );
    expect(Object.keys(dto.defaults).sort()).toEqual(
      ["customization", "discountType", "discountValue", "title"].sort(),
    );
    expect(JSON.stringify(dto)).not.toMatch(/version|configuration|createdAt|updatedAt|isActive/);
  });

  it("is null for a row whose configuration or category cannot be trusted", () => {
    const row = { id: "x", slug: "x", name: "X", category: "fashion", configurationJson: valid() };
    expect(toTemplateDto(row)).not.toBeNull();
    expect(toTemplateDto({ ...row, configurationJson: { sections: [] } })).toBeNull();
    expect(toTemplateDto({ ...row, category: "electronics" })).toBeNull();
  });

  it("strips nothing it should keep and copies the discount and design defaults", () => {
    const dto = templateFixture("seasonal-collection");
    expect(dto.bundleType).toBe("mix_match");
    expect(dto.requiredQuantity).toBe(3);
    expect(dto.defaults).toMatchObject({
      title: "Seasonal Collection",
      discountType: "percentage",
      discountValue: 20,
      customization: { layout: "vertical" },
    });
    expect(dto.sections.length).toBe(dto.suggestedProductCount);
  });
});

describe("request parsing", () => {
  it("accepts a category filter and nothing else", () => {
    expect(parseTemplateQuery(new URLSearchParams("category=beauty"))).toEqual({
      category: "beauty",
    });
    expect(parseTemplateQuery(new URLSearchParams(""))).toEqual({});
    expect(parseTemplateQuery(new URLSearchParams("category="))).toEqual({});
    for (const bad of ["category=toys", "shopId=abc", "isActive=false", "status=inactive"]) {
      expect(() => parseTemplateQuery(new URLSearchParams(bad)), bad).toThrow();
    }
  });

  it("accepts only a uuid as an id", () => {
    expect(parseTemplateId("7c1a0000-0000-4000-8000-000000000001")).toBeTruthy();
    for (const bad of [
      "complete-look",
      "1",
      "",
      "../etc",
      "7c1a0000-0000-4000-8000-00000000000g",
    ]) {
      expect(() => parseTemplateId(bad), bad).toThrow();
    }
  });
});
