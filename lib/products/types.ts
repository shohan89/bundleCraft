/**
 * Product catalog shapes shared by the API, services and dashboard. Dependency-free
 * (no Prisma) so client components can import them. Deliberately omits shop ids and
 * any sync internals: a merchant sees their products, not our bookkeeping.
 */
export const PRODUCT_LIST_STATUSES = ["active", "draft", "archived"] as const;
export type ProductListStatus = (typeof PRODUCT_LIST_STATUSES)[number];

export interface ProductListItem {
  /** Internal id, used for the detail endpoint. */
  id: string;
  shopifyProductId: string;
  title: string;
  handle: string;
  status: ProductListStatus;
  vendor: string | null;
  productType: string | null;
  imageUrl: string | null;
  variantCount: number;
  /** Variants that can be bought right now. */
  availableVariantCount: number;
  /** True when the product is active and at least one variant can be bought. */
  available: boolean;
}

export interface ProductVariantItem {
  shopifyVariantId: string;
  title: string;
  sku: string | null;
  /** Decimal string, shop currency. */
  price: string | null;
  compareAtPrice: string | null;
  availableForSale: boolean;
  imageUrl: string | null;
}

export interface ProductDetail extends ProductListItem {
  variants: ProductVariantItem[];
}

export type CatalogSyncState = "pending" | "syncing" | "partial" | "synced" | "failed";

export interface CatalogStatus {
  status: CatalogSyncState;
  /** When the last complete sync finished. */
  syncedAt: string | null;
  /** Short code of the last failure, if the last run failed. */
  error: string | null;
}

export interface ProductListResponse {
  items: ProductListItem[];
  page: number;
  limit: number;
  total: number;
  catalog: CatalogStatus;
}

/** POST /api/products/sync */
export interface CatalogSyncResponse {
  outcome: "synced" | "partial" | "already_running";
  products: number;
  variants: number;
  skipped: number;
  markedDeleted: number;
  catalog: CatalogStatus;
}

/**
 * How a bundle's product stands in the synced catalog.
 * - available: active product, variant buyable
 * - sold_out: variant exists but cannot be bought right now (temporary)
 * - unavailable: deleted, draft or archived product, or a variant Shopify removed
 * - unknown: not in this shop's synced catalog
 */
export type ProductAvailability = "available" | "sold_out" | "unavailable" | "unknown";

export function variantAvailability(
  product: { status: string } | null,
  variant: { removedAt: Date | null; availableForSale: boolean } | null,
): ProductAvailability {
  if (!product || !variant) return "unknown";
  if (product.status !== "active" || variant.removedAt !== null) return "unavailable";
  return variant.availableForSale ? "available" : "sold_out";
}
