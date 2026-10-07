import { bundleNotFound } from "@/lib/bundles/errors";
import type { BundleDto } from "@/lib/bundles/types";
import { prisma } from "@/lib/prisma";
import { resolveCatalogRefs } from "@/services/products/validate";
import { bundleInclude, toBundleDto } from "./shared";

/**
 * Looks up by id AND shopId. Another shop's bundle is indistinguishable
 * from a nonexistent one, so IDs can't be probed across tenants.
 */
export async function getBundle(shopId: string, bundleId: string): Promise<BundleDto> {
  const row = await prisma.bundle.findFirst({
    where: { id: bundleId, shopId },
    include: bundleInclude,
    // One joined statement instead of one round trip per relation.
    relationLoadStrategy: "join",
  });
  if (!row) throw bundleNotFound();
  const dto = toBundleDto(row);

  // One catalog lookup for all of the bundle's products: names, images, and whether each
  // is still available in Shopify. The bundle itself is never changed by a product going away.
  const resolved = await resolveCatalogRefs(shopId, dto.products);
  return {
    ...dto,
    products: dto.products.map((product, index) => ({ ...product, catalog: resolved[index] })),
  };
}
