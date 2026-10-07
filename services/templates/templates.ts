import { ApiError } from "@/lib/api/errors";
import { createTtlCache, ttlFromEnv } from "@/lib/cache/ttl";
import { prisma } from "@/lib/prisma";
import { toTemplateDto } from "@/lib/templates/config";
import type { TemplateCategory, TemplateDto } from "@/lib/templates/types";

/**
 * Templates are application-owned and shared by every shop, so nothing here is tenant
 * scoped and nothing here can write: the catalog only changes through the seed.
 *
 * Every template leaves this module through `toTemplateDto`, which validates the stored
 * configuration and keeps only the fields the wizard needs. A row whose configuration is
 * not valid is treated as unavailable rather than half shown.
 */
const select = { id: true, slug: true, name: true, category: true, configurationJson: true };

const templateNotFound = () => new ApiError("TEMPLATE_NOT_FOUND", "Template not found.", 404);

/**
 * The catalog is application-owned and identical for every shop (five seeded rows that only
 * change when the seed is run), so a short per-process cache is safe: no tenant data, no
 * permissions. The seed runs in another process, hence a short TTL (60 s) rather than
 * invalidation; call `clearTemplateCache` after changing rows in the same process.
 */
const listCache = createTtlCache<TemplateDto[]>({ ttlMs: ttlFromEnv("TEMPLATE_CACHE_MS", 60_000) });
export const clearTemplateCache = (): void => listCache.clear();

/** Active templates, Fashion then Beauty, alphabetical. One query (none when cached). */
export async function listTemplates(
  filter: { category?: TemplateCategory } = {},
): Promise<TemplateDto[]> {
  const key = filter.category ?? "all";
  const cached = listCache.get(key);
  if (cached) return structuredClone(cached); // callers may not alter the shared copy

  const rows = await prisma.template.findMany({
    where: { isActive: true, ...(filter.category ? { category: filter.category } : {}) },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select,
  });
  const templates = rows.flatMap((row) => toTemplateDto(row) ?? []);
  listCache.set(key, templates);
  return structuredClone(templates);
}

/** One active, valid template. Unknown, inactive and invalid all look the same: 404. */
export async function getTemplate(id: string): Promise<TemplateDto> {
  const row = await prisma.template.findFirst({ where: { id, isActive: true }, select });
  const dto = row ? toTemplateDto(row) : null;
  if (!dto) throw templateNotFound();
  return dto;
}

export async function getTemplateBySlug(slug: string): Promise<TemplateDto> {
  const row = await prisma.template.findFirst({ where: { slug, isActive: true }, select });
  const dto = row ? toTemplateDto(row) : null;
  if (!dto) throw templateNotFound();
  return dto;
}

/**
 * A template a bundle already points at, whatever its state: used so the editor can name the
 * template of an existing bundle even after it was retired. Returns the public shape plus
 * whether the template can still be chosen; null when the row is gone or unreadable.
 */
export async function getTemplateForBundle(
  id: string,
): Promise<{ template: TemplateDto; active: boolean } | null> {
  const row = await prisma.template.findUnique({
    where: { id },
    select: { ...select, isActive: true },
  });
  const dto = row ? toTemplateDto(row) : null;
  return row && dto ? { template: dto, active: row.isActive } : null;
}

/**
 * Gate for choosing a template on a bundle (create, or changing it on update): it must exist,
 * be active and have a valid configuration. It does NOT read any defaults into the bundle: the
 * final bundle is whatever the merchant submitted, validated by the bundle engine.
 */
export async function assertTemplateSelectable(id: string): Promise<void> {
  const row = await prisma.template.findUnique({
    where: { id },
    select: { ...select, isActive: true },
  });
  if (!row) throw new ApiError("INVALID_TEMPLATE", "The selected template doesn't exist.", 422);
  if (!row.isActive || !toTemplateDto(row)) {
    throw new ApiError("INVALID_TEMPLATE", "The selected template is no longer available.", 422);
  }
}
