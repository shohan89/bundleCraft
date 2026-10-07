/** Test helpers. Not imported by production code. */
import { TEMPLATE_CATALOG } from "./catalog";
import { toTemplateDto } from "./config";
import type { TemplateDto } from "./types";

/** A template exactly as the API would return it, built from the real catalog entry. */
export function templateFixture(slug: string, id = `id-${slug}`): TemplateDto {
  const entry = TEMPLATE_CATALOG.find((template) => template.slug === slug);
  if (!entry) throw new Error(`No catalog template "${slug}"`);
  const dto = toTemplateDto({
    id,
    slug,
    name: entry.name,
    category: entry.category,
    configurationJson: entry.configuration,
  });
  if (!dto) throw new Error(`Catalog template "${slug}" is invalid`);
  return dto;
}
