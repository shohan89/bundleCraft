/**
 * Validation of template configuration. Template data is application-owned, but it is
 * still parsed strictly before use: a row edited by hand, a half-migrated older shape or
 * a future field must never reach the wizard or a bundle unchecked. Business rules for the
 * defaults (discount range, quantities, colours) are NOT repeated here: the defaults are
 * run through the bundle engine's own draft validation (`validateBundleDraft`).
 */
import { z } from "zod";
import { validateBundleDraft } from "@/lib/bundles/rules";
import { BUNDLE_TYPES, DISCOUNT_TYPES } from "@/lib/bundles/types";
import type { BundleCustomization } from "@/lib/customization/types";
import { validateCustomization } from "@/lib/customization/validation";
import type { TemplateConfiguration, TemplateDto } from "./types";
import { TEMPLATE_CATEGORIES, type TemplateCategory } from "./types";

/**
 * Plain text only: no angle brackets or control characters. React escapes text anyway;
 * this keeps markup out of the data altogether (defence in depth).
 */
const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !/[<>\u0000-\u001f\u007f]/.test(value), "Plain text only.");

const section = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9-]{0,29}$/),
    label: text(1, 40),
    hint: text(1, 120),
  })
  .strict();

const configurationSchema = z
  .object({
    version: z.literal(1),
    description: text(10, 300),
    intendedUse: text(10, 300),
    titleSuggestion: text(1, 80),
    bundleType: z.enum(BUNDLE_TYPES),
    requiredQuantity: z.number().int().nullable(),
    suggestedProductCount: z.number().int().min(1).max(10),
    sections: z.array(section).min(1).max(8),
    discount: z.object({ type: z.enum(DISCOUNT_TYPES), value: z.number() }).strict(),
    // Same strict rules as a saved bundle (unknown fields, colours, options).
    customization: z.custom<BundleCustomization>(
      (value) => validateCustomization(value).length === 0,
      "Invalid customization.",
    ),
  })
  .strict()
  .refine(
    (config) => new Set(config.sections.map((s) => s.key)).size === config.sections.length,
    "Section keys must be unique.",
  );

/** Parses and rule-checks a configuration. Returns null when it cannot be trusted. */
export function parseTemplateConfiguration(raw: unknown): TemplateConfiguration | null {
  const parsed = configurationSchema.safeParse(raw);
  if (!parsed.success) return null;
  const config = parsed.data;

  const issues = validateBundleDraft({
    title: config.titleSuggestion,
    description: null,
    bundleType: config.bundleType,
    templateId: null,
    requiredQuantity: config.requiredQuantity,
    discountType: config.discount.type,
    discountValue: config.discount.value,
    products: [],
    customization: config.customization,
  });
  return issues.length === 0 ? config : null;
}

export const isTemplateCategory = (value: unknown): value is TemplateCategory =>
  typeof value === "string" && (TEMPLATE_CATEGORIES as readonly string[]).includes(value);

/** Row -> the safe public shape, or null when the stored configuration is not valid. */
export function toTemplateDto(row: {
  id: string;
  slug: string;
  name: string;
  category: string;
  configurationJson: unknown;
}): TemplateDto | null {
  const config = parseTemplateConfiguration(row.configurationJson);
  if (!config || !isTemplateCategory(row.category)) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    description: config.description,
    intendedUse: config.intendedUse,
    bundleType: config.bundleType,
    requiredQuantity: config.requiredQuantity,
    suggestedProductCount: config.suggestedProductCount,
    sections: config.sections,
    defaults: {
      title: config.titleSuggestion,
      discountType: config.discount.type,
      discountValue: config.discount.value,
      customization: config.customization,
    },
  };
}
