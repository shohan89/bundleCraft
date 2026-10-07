import type { BundleDto } from "@/lib/bundles/types";
import { prisma } from "@/lib/prisma";
import { bundleInclude, toBundleDto } from "./shared";

export interface BundlePage {
  page: number;
  limit: number;
}

/**
 * Newest first, with products and customization in ONE joined statement (no per-bundle
 * follow-up queries). Without `paging` every bundle is returned (internal callers); the API
 * always pages so a shop with many bundles cannot produce an unbounded response.
 */
export async function listBundles(shopId: string, paging?: BundlePage): Promise<BundleDto[]> {
  const rows = await prisma.bundle.findMany({
    where: { shopId },
    include: bundleInclude,
    relationLoadStrategy: "join",
    // Ties broken by id so pages never overlap or skip a bundle created in the same instant.
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    ...(paging ? { skip: (paging.page - 1) * paging.limit, take: paging.limit } : {}),
  });
  return rows.map(toBundleDto);
}

export const countBundles = (shopId: string): Promise<number> =>
  prisma.bundle.count({ where: { shopId } });
