/**
 * Shopify product reads for the catalog sync (ACTION-012), over the shared Admin
 * GraphQL transport. Read-only: BundleCraft never writes to a merchant's products.
 * Needs the existing `read_products` scope.
 *
 * Cost control: a product page asks for a modest number of products and variants
 * so the query stays under Shopify's per-query cost ceiling. A product with more
 * variants than one page holds has its remaining variants fetched here, so what
 * is handed on is always COMPLETE (the sync relies on that to mark removed variants).
 * Throttling is retried a few times with a growing pause, never in a tight loop.
 */
import { ShopifyAdminApiError } from "./admin";
import { createAdminGraphql, ShopifyThrottledError, type AdminGraphql } from "./graphql";

export { ShopifyPermissionError, ShopifyThrottledError } from "./graphql";

export const PRODUCTS_PAGE_SIZE = 20;
const VARIANTS_PER_PAGE = 50;
const MAX_VARIANT_PAGES = 50; // 2,500 variants: above Shopify's own per-product ceiling
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

export interface ProductsPage {
  /** Raw Shopify product nodes, variants complete. Validate with parseShopifyProduct. */
  nodes: unknown[];
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface CatalogGateway {
  fetchProductsPage(after: string | null, pageSize?: number): Promise<ProductsPage>;
  /** null when Shopify has no such product. */
  fetchProduct(gid: string): Promise<unknown | null>;
}

const VARIANT_FIELDS = `
  id title sku price compareAtPrice availableForSale
  image { url }
`;
const PRODUCT_FIELDS = `
  id title handle status vendor productType updatedAt
  featuredImage { url }
  variants(first: ${VARIANTS_PER_PAGE}) {
    pageInfo { hasNextPage endCursor }
    nodes { ${VARIANT_FIELDS} }
  }
`;

const PAGE_QUERY = `
  query BundleCraftProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: ID) {
      pageInfo { hasNextPage endCursor }
      nodes { ${PRODUCT_FIELDS} }
    }
  }
`;
const PRODUCT_QUERY = `
  query BundleCraftProduct($id: ID!) {
    product(id: $id) { ${PRODUCT_FIELDS} }
  }
`;
const MORE_VARIANTS_QUERY = `
  query BundleCraftVariants($id: ID!, $after: String) {
    product(id: $id) {
      variants(first: ${VARIANTS_PER_PAGE}, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { ${VARIANT_FIELDS} }
      }
    }
  }
`;

interface VariantConnection {
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
  nodes?: unknown[];
}
type ProductNode = { id?: unknown; variants?: VariantConnection } & Record<string, unknown>;

export interface GatewayOptions {
  /** Injectable for tests; production waits for real. */
  sleep?: (ms: number) => Promise<void>;
}

export function createCatalogGateway(
  shop: string,
  accessToken: string,
  options: GatewayOptions = {},
): CatalogGateway {
  return createCatalogGatewayFrom(createAdminGraphql(shop, accessToken), options);
}

/** Separate from the factory so tests can drive the paging logic without HTTP. */
export function createCatalogGatewayFrom(
  graphql: AdminGraphql,
  options: GatewayOptions = {},
): CatalogGateway {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  async function call<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await graphql<T>(query, variables);
      } catch (error) {
        if (!(error instanceof ShopifyThrottledError) || attempt >= RETRY_DELAYS_MS.length) {
          throw error;
        }
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  /** Follows variant pagination so `node.variants.nodes` holds every variant. */
  async function completeVariants(node: ProductNode): Promise<ProductNode> {
    const connection = node.variants;
    if (!connection || !Array.isArray(connection.nodes)) return node;
    let hasNext = connection.pageInfo?.hasNextPage === true;
    let cursor = connection.pageInfo?.endCursor ?? null;
    const nodes = [...connection.nodes];

    for (let page = 0; hasNext; page++) {
      if (page >= MAX_VARIANT_PAGES || !cursor || typeof node.id !== "string") {
        throw new ShopifyAdminApiError("Product has more variants than can be synced");
      }
      const data = await call<{ product: { variants?: VariantConnection } | null }>(
        MORE_VARIANTS_QUERY,
        { id: node.id, after: cursor },
      );
      const next = data.product?.variants;
      if (!next || !Array.isArray(next.nodes)) {
        throw new ShopifyAdminApiError("Shopify returned an unreadable variant page");
      }
      nodes.push(...next.nodes);
      hasNext = next.pageInfo?.hasNextPage === true;
      cursor = next.pageInfo?.endCursor ?? null;
    }
    return { ...node, variants: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } };
  }

  return {
    async fetchProductsPage(after, pageSize = PRODUCTS_PAGE_SIZE) {
      const data = await call<{
        products?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          nodes?: ProductNode[];
        };
      }>(PAGE_QUERY, { first: pageSize, after });
      const page = data.products;
      if (!page || !Array.isArray(page.nodes)) {
        throw new ShopifyAdminApiError("Shopify returned an unreadable product page");
      }
      const nodes: unknown[] = [];
      for (const node of page.nodes) nodes.push(await completeVariants(node));
      return {
        nodes,
        hasNextPage: page.pageInfo?.hasNextPage === true,
        endCursor: page.pageInfo?.endCursor ?? null,
      };
    },

    async fetchProduct(gid) {
      const data = await call<{ product?: ProductNode | null }>(PRODUCT_QUERY, { id: gid });
      if (data.product === undefined) {
        throw new ShopifyAdminApiError("Shopify returned an unreadable product");
      }
      return data.product === null ? null : completeVariants(data.product);
    },
  };
}
