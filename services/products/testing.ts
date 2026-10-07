/**
 * Test doubles and seeding helpers for the product catalog. The fake gateway mimics
 * the parts of Shopify's product API the sync relies on (id-ordered, cursor-paginated
 * pages; single-product reads that return null when gone), but it is NOT Shopify:
 * tests using it prove our sync logic, not that Shopify accepts our GraphQL. Not
 * imported by production code.
 */
import type { BundleDraftInput } from "@/lib/bundles/types";
import { prisma } from "@/lib/prisma";
import { createBundle } from "@/services/bundles/create";
import { ShopifyAdminApiError } from "@/services/shopify/admin";
import type { CatalogGateway, ProductsPage } from "@/services/shopify/products";

export interface RawVariantSpec {
  id: number | string;
  title?: string;
  sku?: string | null;
  price?: string | null;
  compareAtPrice?: string | null;
  availableForSale?: boolean;
  image?: string | null;
}

export interface RawProductSpec {
  id: number | string;
  title?: string;
  handle?: string;
  status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
  vendor?: string | null;
  productType?: string | null;
  updatedAt?: string;
  image?: string | null;
  variants?: RawVariantSpec[];
}

/** A Shopify product node exactly as the (completed) gateway hands it over. */
export function rawProduct(spec: RawProductSpec): Record<string, unknown> {
  const variants = spec.variants ?? [{ id: Number(spec.id) + 1_000_000 }];
  return {
    id: `gid://shopify/Product/${spec.id}`,
    title: spec.title ?? `Product ${spec.id}`,
    handle: spec.handle ?? `product-${spec.id}`,
    status: spec.status ?? "ACTIVE",
    vendor: spec.vendor === undefined ? "Acme" : spec.vendor,
    productType: spec.productType === undefined ? "Tee" : spec.productType,
    updatedAt: spec.updatedAt ?? "2026-09-01T10:00:00Z",
    featuredImage:
      spec.image === null ? null : { url: spec.image ?? "https://cdn.shopify.com/p.png" },
    variants: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: variants.map((v) => ({
        id: `gid://shopify/ProductVariant/${v.id}`,
        title: v.title ?? "Default",
        sku: v.sku === undefined ? null : v.sku,
        price: v.price === undefined ? "19.00" : v.price,
        compareAtPrice: v.compareAtPrice === undefined ? null : v.compareAtPrice,
        availableForSale: v.availableForSale ?? true,
        image: v.image ? { url: v.image } : null,
      })),
    },
  };
}

export interface FakeCatalogGateway extends CatalogGateway {
  products: Map<string, Record<string, unknown>>;
  calls: string[];
  /** Products per page can be forced small to exercise pagination. */
  pageSize: number | null;
  /** When true, a read of an unknown product returns a default product instead of null. */
  autoCreate: boolean;
  set(spec: RawProductSpec): void;
  remove(id: number | string): void;
  failNext(method: keyof CatalogGateway, error?: Error): void;
  /** Runs once, before the next page/product read is answered (to inject concurrent changes). */
  beforeNextRead(hook: () => Promise<void>): void;
  reset(): void;
}

export function createFakeCatalogGateway(): FakeCatalogGateway {
  const failures = new Map<string, Error>();
  let hook: (() => Promise<void>) | null = null;
  const gateway: FakeCatalogGateway = {
    products: new Map(),
    calls: [],
    pageSize: null,
    autoCreate: false,
    set(spec) {
      gateway.products.set(`gid://shopify/Product/${spec.id}`, rawProduct(spec));
    },
    remove(id) {
      gateway.products.delete(`gid://shopify/Product/${id}`);
    },
    failNext(method, error = new ShopifyAdminApiError("simulated Shopify failure")) {
      failures.set(method, error);
    },
    beforeNextRead(fn) {
      hook = fn;
    },
    reset() {
      gateway.products.clear();
      gateway.calls.length = 0;
      gateway.pageSize = null;
      gateway.autoCreate = false;
      failures.clear();
      hook = null;
    },

    async fetchProductsPage(after, pageSize = 20): Promise<ProductsPage> {
      await enter("fetchProductsPage");
      const size = gateway.pageSize ?? pageSize;
      const all = [...gateway.products.entries()]
        .sort(([a], [b]) => Number(a.split("/").pop()) - Number(b.split("/").pop()))
        .map(([, node]) => node);
      const start = after === null ? 0 : Number(after);
      const nodes = all.slice(start, start + size);
      const end = start + nodes.length;
      return {
        nodes,
        hasNextPage: end < all.length,
        endCursor: end < all.length ? String(end) : null,
      };
    },
    async fetchProduct(gid) {
      await enter("fetchProduct");
      const known = gateway.products.get(gid);
      if (known) return known;
      if (!gateway.autoCreate) return null;
      return rawProduct({ id: gid.split("/").pop()! });
    },
  };

  async function enter(method: string) {
    gateway.calls.push(method);
    if (hook) {
      const run = hook;
      hook = null;
      await run();
    }
    const failure = failures.get(method);
    if (failure) {
      failures.delete(method);
      throw failure;
    }
  }
  return gateway;
}

export interface SeedProduct {
  productId: string;
  variantId: string;
  status?: "active" | "draft" | "archived" | "deleted";
  available?: boolean;
  title?: string;
  variantTitle?: string;
  price?: string;
}

/** Puts products straight into a shop's synced catalog (no Shopify involved). Idempotent. */
export async function seedCatalog(shopId: string, seeds: SeedProduct[]): Promise<void> {
  for (const seed of seeds) {
    const product = await prisma.product.upsert({
      where: { shopId_shopifyProductId: { shopId, shopifyProductId: seed.productId } },
      create: {
        shopId,
        shopifyProductId: seed.productId,
        title: seed.title ?? `Product ${seed.productId}`,
        handle: `product-${seed.productId}`,
        status: seed.status ?? "active",
        imageUrl: "https://cdn.shopify.com/p.png",
        shopifyUpdatedAt: new Date("2026-09-01T10:00:00Z"),
        deletedAt: seed.status === "deleted" ? new Date() : null,
      },
      update: {},
    });
    await prisma.productVariant.upsert({
      where: { shopId_shopifyVariantId: { shopId, shopifyVariantId: seed.variantId } },
      create: {
        shopId,
        productId: product.id,
        shopifyVariantId: seed.variantId,
        title: seed.variantTitle ?? "Default",
        price: seed.price ?? "10.00",
        availableForSale: seed.available ?? true,
      },
      update: {},
    });
  }
}

const numeric = (id: string) => /(\d+)$/.exec(id)?.[1] ?? id;

/** Makes sure every product a bundle input names exists in the shop's catalog (as an active, buyable product). */
export async function seedCatalogFor(
  shopId: string,
  products: { shopifyProductId: string; shopifyVariantId: string }[],
): Promise<void> {
  await seedCatalog(
    shopId,
    products.map((p) => ({
      productId: numeric(p.shopifyProductId),
      variantId: numeric(p.shopifyVariantId),
    })),
  );
}

/** createBundle for tests: seeds the catalog for the input's products first. */
export async function createBundleSeeded(
  shopId: string,
  input: BundleDraftInput,
  options: { verifyCatalog?: boolean } = {},
) {
  await seedCatalogFor(shopId, input.products);
  return createBundle(shopId, input, options);
}
