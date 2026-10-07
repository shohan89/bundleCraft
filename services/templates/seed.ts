import { TEMPLATE_CATALOG } from "@/lib/templates/catalog";
import { parseTemplateConfiguration } from "@/lib/templates/config";
import type { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Puts the five MVP templates into the database. Idempotent and deterministic: rows are
 * matched by `slug`, so running it any number of times never adds a duplicate, and a row that
 * already exists keeps its id (bundles reference templates by id). It rewrites the name,
 * category and configuration of catalog templates to the code's version and re-activates
 * them, but never touches templates that are not in the catalog and never deletes anything.
 */
export async function seedTemplates(
  client: Pick<PrismaClient, "template">,
): Promise<{ upserted: number }> {
  for (const template of TEMPLATE_CATALOG) {
    // A broken catalog entry must fail loudly here, not surface as a hidden template later.
    if (!parseTemplateConfiguration(template.configuration)) {
      throw new Error(`Template "${template.slug}" has an invalid configuration.`);
    }
    const data = {
      name: template.name,
      category: template.category,
      configurationJson: template.configuration as unknown as object,
      isActive: true,
    };
    await client.template.upsert({
      where: { slug: template.slug },
      update: data,
      create: { id: template.id, slug: template.slug, ...data },
    });
  }
  return { upserted: TEMPLATE_CATALOG.length };
}
