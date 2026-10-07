import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ProductQuery } from "@/lib/products/validation";
import type {
  CatalogStatus,
  ProductDetail,
  ProductListItem,
  ProductListResponse,
  ProductListStatus,
  ProductVariantItem,
} from "@/lib/products/types";
import { ApiError } from "@/lib/api/errors";

/** Cap on variants returned for one product (Shopify allows more; the picker needs far fewer). */
const MAX_VARIANTS_RETURNED = 250;

/**
 * Prisma passes `contains` text to a LIKE pattern unescaped, so a merchant typing "%" or "_"
 * would get wildcard behaviour instead of a literal search. Escape LIKE's own characters.
 */
export const escapeLike = (text: string): string => text.replace(/[\\%_]/g, "\\$&");

const productNotFound = () => new ApiError("PRODUCT_NOT_FOUND", "Product not found.", 404);

export async function getCatalogStatus(shopId: string): Promise<CatalogStatus> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { catalogSyncStatus: true, catalogSyncedAt: true, catalogSyncError: true },
  });
  return {
    status: shop?.catalogSyncStatus ?? "pending",
    syncedAt: shop?.catalogSyncedAt?.toISOString() ?? null,
    error: shop?.catalogSyncError ?? null,
  };
}

type ProductRow = {
  id: string;
  shopifyProductId: string;
  title: string;
  handle: string;
  status: "active" | "draft" | "archived" | "deleted";
  vendor: string | null;
  productType: string | null;
  imageUrl: string | null;
};

function toItem(
  row: ProductRow,
  variantCount: number,
  availableVariantCount: number,
): ProductListItem {
  return {
    id: row.id,
    shopifyProductId: row.shopifyProductId,
    title: row.title,
    handle: row.handle,
    // Deleted products never reach the merchant API; the cast documents that.
    status: row.status as ProductListStatus,
    vendor: row.vendor,
    productType: row.productType,
    imageUrl: row.imageUrl,
    variantCount,
    availableVariantCount,
    available: row.status === "active" && availableVariantCount > 0,
  };
}

/**
 * Paginated, filtered product list for the authenticated shop. Two queries regardless of
 * page size: the products (with a total count), then one grouped count of variants for
 * exactly those products. Deleted products are never listed.
 */
export async function listProducts(
  shopId: string,
  query: ProductQuery,
): Promise<ProductListResponse> {
  const where: Prisma.ProductWhereInput = {
    shopId,
    status: query.status ?? { not: "deleted" },
    ...(query.productType
      ? { productType: { equals: escapeLike(query.productType), mode: "insensitive" } }
      : {}),
    ...(query.vendor ? { vendor: { equals: escapeLike(query.vendor), mode: "insensitive" } } : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: escapeLike(query.search), mode: "insensitive" } },
            { handle: { contains: escapeLike(query.search), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total, catalog] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ title: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        shopifyProductId: true,
        title: true,
        handle: true,
        status: true,
        vendor: true,
        productType: true,
        imageUrl: true,
      },
    }),
    prisma.product.count({ where }),
    getCatalogStatus(shopId),
  ]);

  const ids = rows.map((row) => row.id);
  const counts =
    ids.length === 0
      ? []
      : await prisma.productVariant.groupBy({
          by: ["productId", "availableForSale"],
          where: { shopId, productId: { in: ids }, removedAt: null },
          _count: { _all: true },
        });
  const totals = new Map<string, { all: number; available: number }>();
  for (const row of counts) {
    const entry = totals.get(row.productId) ?? { all: 0, available: 0 };
    entry.all += row._count._all;
    if (row.availableForSale) entry.available += row._count._all;
    totals.set(row.productId, entry);
  }

  return {
    items: rows.map((row) => {
      const t = totals.get(row.id) ?? { all: 0, available: 0 };
      return toItem(row, t.all, t.available);
    }),
    page: query.page,
    limit: query.limit,
    total,
    catalog,
  };
}

const toVariantItem = (variant: {
  shopifyVariantId: string;
  title: string;
  sku: string | null;
  price: { toFixed(digits: number): string } | null;
  compareAtPrice: { toFixed(digits: number): string } | null;
  availableForSale: boolean;
  imageUrl: string | null;
}): ProductVariantItem => ({
  shopifyVariantId: variant.shopifyVariantId,
  title: variant.title,
  sku: variant.sku,
  price: variant.price?.toFixed(2) ?? null,
  compareAtPrice: variant.compareAtPrice?.toFixed(2) ?? null,
  availableForSale: variant.availableForSale,
  imageUrl: variant.imageUrl,
});

/** One product with its variants. Another shop's product, or a deleted one, is a plain 404. */
export async function getProduct(shopId: string, productId: string): Promise<ProductDetail> {
  const row = await prisma.product.findFirst({
    where: { id: productId, shopId, status: { not: "deleted" } },
    relationLoadStrategy: "join",
    include: {
      variants: {
        where: { removedAt: null },
        orderBy: { position: "asc" },
        take: MAX_VARIANTS_RETURNED,
      },
    },
  });
  if (!row) throw productNotFound();

  const variants = row.variants.map(toVariantItem);
  return {
    ...toItem(row, variants.length, variants.filter((v) => v.availableForSale).length),
    variants,
  };
}
