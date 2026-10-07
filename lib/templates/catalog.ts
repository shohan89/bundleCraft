/**
 * The five MVP templates (docs/01-PRD.md). Application-owned data: seeded into `templates`
 * by services/templates/seed.ts, keyed by `slug`. Deliberately no Shopify product ids, SKUs
 * or merchant data: sections only suggest what kind of product to pick.
 */
import type { BundleCustomization, BundleCustomizationPatch } from "@/lib/customization/types";
import { mergeCustomization } from "@/lib/customization/validation";
import type { TemplateCategory, TemplateConfiguration } from "./types";

export interface CatalogTemplate {
  /** Used when the row is first created, so a fresh database gets the same ids everywhere. */
  id: string;
  slug: string;
  name: string;
  category: TemplateCategory;
  configuration: TemplateConfiguration;
}

/** Starting design: the shared defaults with this template's own choices on top. */
const design = (patch: BundleCustomizationPatch): BundleCustomization => mergeCustomization(patch);

export const TEMPLATE_CATALOG: readonly CatalogTemplate[] = [
  {
    id: "7c1a0000-0000-4000-8000-000000000001",
    slug: "complete-look",
    name: "Complete Look",
    category: "fashion",
    configuration: {
      version: 1,
      description: "A coordinated outfit from head to toe, sold together at a bundle price.",
      intendedUse: "Best when your products are designed to be worn together.",
      titleSuggestion: "Complete Look",
      bundleType: "fixed",
      requiredQuantity: null,
      suggestedProductCount: 4,
      sections: [
        { key: "top", label: "Top", hint: "A shirt, blouse, knit or jacket." },
        { key: "bottom", label: "Bottom", hint: "Trousers, jeans or a skirt." },
        { key: "shoes", label: "Shoes", hint: "The pair that finishes the look." },
        { key: "accessory", label: "Accessory", hint: "A bag, belt, scarf or jewellery." },
      ],
      discount: { type: "percentage", value: 15 },
      customization: design({
        layout: "card",
        card: { borderRadius: "medium", shadow: "subtle" },
        typography: { titleSize: "medium", descriptionSize: "small" },
      }),
    },
  },
  {
    id: "7c1a0000-0000-4000-8000-000000000002",
    slug: "weekend-outfit",
    name: "Weekend Outfit",
    category: "fashion",
    configuration: {
      version: 1,
      description: "A relaxed, ready-to-wear outfit for days off.",
      intendedUse: "Best for casual pieces that customers can buy in one go.",
      titleSuggestion: "Weekend Outfit",
      bundleType: "fixed",
      requiredQuantity: null,
      suggestedProductCount: 4,
      sections: [
        { key: "main", label: "Main piece", hint: "The hero item, such as a hoodie or dress." },
        { key: "second", label: "Second piece", hint: "Something to pair with it." },
        { key: "footwear", label: "Footwear", hint: "Sneakers, sandals or boots." },
        { key: "accessory", label: "Accessory", hint: "A cap, tote or sunglasses." },
      ],
      discount: { type: "percentage", value: 10 },
      customization: design({
        layout: "horizontal",
        colors: {
          primary: "#1f2937",
          button: "#1f2937",
          background: "#f9fafb",
          accent: "#0369a1",
          text: "#1f2937",
        },
        typography: { fontFamily: "sans" },
        card: { borderRadius: "large", shadow: "none" },
      }),
    },
  },
  {
    id: "7c1a0000-0000-4000-8000-000000000003",
    slug: "seasonal-collection",
    name: "Seasonal Collection",
    category: "fashion",
    configuration: {
      version: 1,
      description: "Let customers pick their favourites from a seasonal range and save.",
      intendedUse: "Best for a campaign such as summer, autumn or holiday pieces.",
      titleSuggestion: "Seasonal Collection",
      bundleType: "mix_match",
      requiredQuantity: 3,
      suggestedProductCount: 4,
      sections: [
        { key: "pick-1", label: "Seasonal piece 1", hint: "A product from your seasonal range." },
        { key: "pick-2", label: "Seasonal piece 2", hint: "Another seasonal product." },
        { key: "pick-3", label: "Seasonal piece 3", hint: "Another seasonal product." },
        { key: "pick-4", label: "Seasonal piece 4", hint: "Add more so customers can choose." },
      ],
      discount: { type: "percentage", value: 20 },
      customization: design({
        layout: "vertical",
        colors: {
          primary: "#7c2d12",
          button: "#9a3412",
          background: "#fff7ed",
          accent: "#c2410c",
          text: "#431407",
        },
        typography: { fontFamily: "serif", titleSize: "large" },
        card: { borderRadius: "small", shadow: "subtle" },
      }),
    },
  },
  {
    id: "7c1a0000-0000-4000-8000-000000000004",
    slug: "skincare-routine",
    name: "Skincare Routine",
    category: "beauty",
    configuration: {
      version: 1,
      description: "A step-by-step skincare routine in one bundle.",
      intendedUse: "Best when the products are meant to be used in a set order.",
      titleSuggestion: "Skincare Routine",
      bundleType: "fixed",
      requiredQuantity: null,
      suggestedProductCount: 4,
      sections: [
        { key: "cleanser", label: "Cleanser", hint: "The first step of the routine." },
        { key: "treatment", label: "Treatment", hint: "A serum or targeted treatment." },
        { key: "moisturizer", label: "Moisturizer", hint: "A cream or lotion." },
        { key: "spf", label: "SPF", hint: "Sun protection for the day." },
      ],
      discount: { type: "percentage", value: 15 },
      customization: design({
        layout: "card",
        colors: {
          primary: "#0f766e",
          button: "#0f766e",
          background: "#f0fdfa",
          accent: "#0f766e",
          text: "#134e4a",
        },
        card: { borderRadius: "large", shadow: "none" },
        spacing: { density: "comfortable" },
      }),
    },
  },
  {
    id: "7c1a0000-0000-4000-8000-000000000005",
    slug: "hair-care-kit",
    name: "Hair Care Kit",
    category: "beauty",
    configuration: {
      version: 1,
      description: "Everything for a hair-care routine, sold as one kit.",
      intendedUse: "Best for products that work together, such as a wash and care set.",
      titleSuggestion: "Hair Care Kit",
      bundleType: "fixed",
      requiredQuantity: null,
      suggestedProductCount: 4,
      sections: [
        { key: "shampoo", label: "Shampoo", hint: "The cleansing step." },
        { key: "conditioner", label: "Conditioner", hint: "Softens and detangles." },
        { key: "treatment", label: "Treatment", hint: "A mask, oil or leave-in." },
        { key: "styling", label: "Styling product", hint: "A cream, spray or gel." },
      ],
      discount: { type: "percentage", value: 20 },
      customization: design({
        layout: "card",
        colors: {
          primary: "#6d28d9",
          button: "#6d28d9",
          background: "#faf5ff",
          accent: "#7c3aed",
          text: "#3b0764",
        },
        card: { borderRadius: "medium", shadow: "strong" },
        button: { style: "filled", size: "large" },
      }),
    },
  },
];
