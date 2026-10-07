// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShopifyAdminApiError } from "./admin";
import { ShopifyPermissionError, ShopifyThrottledError, createAdminGraphql } from "./graphql";
import { createCatalogGatewayFrom } from "./products";

/**
 * Paging, variant completion and throttling of the catalog gateway, driven by a stub
 * GraphQL transport. Proves our request handling, NOT that Shopify accepts these queries.
 */
const variantNode = (id: number) => ({
  id: `gid://shopify/ProductVariant/${id}`,
  title: `V${id}`,
  price: "10.00",
  availableForSale: true,
});
const productNode = (id: number, variants: number[], more: string | null = null) => ({
  id: `gid://shopify/Product/${id}`,
  title: `P${id}`,
  variants: {
    pageInfo: { hasNextPage: more !== null, endCursor: more },
    nodes: variants.map(variantNode),
  },
});

const noSleep = async () => {};

describe("catalog gateway", () => {
  it("returns a page of products with the cursor for the next one", async () => {
    const graphql = vi.fn(async () => ({
      products: {
        pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
        nodes: [productNode(1, [11]), productNode(2, [21, 22])],
      },
    }));
    const gateway = createCatalogGatewayFrom(graphql as never, { sleep: noSleep });
    const page = await gateway.fetchProductsPage(null, 2);

    expect(page.nodes).toHaveLength(2);
    expect(page).toMatchObject({ hasNextPage: true, endCursor: "cursor-1" });
    expect(graphql).toHaveBeenCalledWith(expect.stringContaining("products(first: $first"), {
      first: 2,
      after: null,
    });
  });

  it("passes the cursor through, and reports the last page", async () => {
    const graphql = vi.fn(async () => ({
      products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
    }));
    const gateway = createCatalogGatewayFrom(graphql as never, { sleep: noSleep });
    expect(await gateway.fetchProductsPage("cursor-1")).toEqual({
      nodes: [],
      hasNextPage: false,
      endCursor: null,
    });
    expect((graphql.mock.calls[0] as unknown[])[1]).toMatchObject({ after: "cursor-1" });
  });

  it("follows variant pagination so a product is always handed over complete", async () => {
    const graphql = vi.fn(async (query: string, variables?: Record<string, unknown>) => {
      if (query.includes("BundleCraftVariants")) {
        return variables?.after === "v-cursor-1"
          ? {
              product: {
                variants: {
                  pageInfo: { hasNextPage: true, endCursor: "v-cursor-2" },
                  nodes: [variantNode(3)],
                },
              },
            }
          : {
              product: {
                variants: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [variantNode(4)],
                },
              },
            };
      }
      return {
        products: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [productNode(1, [1, 2], "v-cursor-1")],
        },
      };
    });
    const gateway = createCatalogGatewayFrom(graphql as never, { sleep: noSleep });
    const [node] = (await gateway.fetchProductsPage(null)).nodes as ReturnType<
      typeof productNode
    >[];

    expect(node.variants.nodes.map((v) => v.id.split("/").pop())).toEqual(["1", "2", "3", "4"]);
    expect(node.variants.pageInfo.hasNextPage).toBe(false);
    expect(graphql).toHaveBeenCalledTimes(3); // one page + two extra variant pages, not one per variant
  });

  it("retries a throttled request with a growing pause, then succeeds", async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const graphql = vi.fn(async () => {
      if (++calls <= 2) throw new ShopifyThrottledError("slow down");
      return { product: productNode(9, [91]) };
    });
    const gateway = createCatalogGatewayFrom(graphql as never, { sleep });
    expect(await gateway.fetchProduct("gid://shopify/Product/9")).toMatchObject({ title: "P9" });
    expect(graphql).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([1000, 2000]);
  });

  it("gives up after a bounded number of throttled retries (no tight loop)", async () => {
    const sleep = vi.fn(async () => {});
    const graphql = vi.fn(async () => {
      throw new ShopifyThrottledError("slow down");
    });
    const gateway = createCatalogGatewayFrom(graphql as never, { sleep });
    await expect(gateway.fetchProduct("gid://shopify/Product/1")).rejects.toBeInstanceOf(
      ShopifyThrottledError,
    );
    expect(graphql).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it("does not retry errors that retrying cannot fix", async () => {
    for (const error of [new ShopifyPermissionError("denied"), new ShopifyAdminApiError("boom")]) {
      const sleep = vi.fn(async () => {});
      const graphql = vi.fn(async () => {
        throw error;
      });
      const gateway = createCatalogGatewayFrom(graphql as never, { sleep });
      await expect(gateway.fetchProductsPage(null)).rejects.toBe(error);
      expect(graphql).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it("fetchProduct returns null for a missing product, and rejects unreadable answers", async () => {
    const missing = createCatalogGatewayFrom((async () => ({ product: null })) as never);
    expect(await missing.fetchProduct("gid://shopify/Product/1")).toBeNull();

    for (const answer of [{}, { products: {} }, { products: { nodes: "x" } }]) {
      const gateway = createCatalogGatewayFrom((async () => answer) as never);
      await expect(gateway.fetchProductsPage(null)).rejects.toBeInstanceOf(ShopifyAdminApiError);
    }
    const odd = createCatalogGatewayFrom((async () => ({})) as never);
    await expect(odd.fetchProduct("gid://shopify/Product/1")).rejects.toBeInstanceOf(
      ShopifyAdminApiError,
    );
  });

  it("refuses to hand over a product whose variants cannot be completed", async () => {
    const graphql = vi.fn(async (query: string) =>
      query.includes("BundleCraftVariants")
        ? { product: null }
        : { product: productNode(1, [1], "v-cursor") },
    );
    const gateway = createCatalogGatewayFrom(graphql as never, { sleep: noSleep });
    await expect(gateway.fetchProduct("gid://shopify/Product/1")).rejects.toBeInstanceOf(
      ShopifyAdminApiError,
    );
  });
});

describe("shared Admin GraphQL transport: throttling and secrecy", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  afterEach(() => fetchMock.mockReset());

  it("classifies HTTP 429 and THROTTLED errors as throttling, other failures as generic", async () => {
    const graphql = createAdminGraphql("shop.myshopify.com", "shpat_secret_token");
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    await expect(graphql("query { x }")).rejects.toBeInstanceOf(ShopifyThrottledError);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ extensions: { code: "THROTTLED" } }] }), {
        status: 200,
      }),
    );
    await expect(graphql("query { x }")).rejects.toBeInstanceOf(ShopifyThrottledError);
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const error = await graphql("query { x }").catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ShopifyThrottledError);
    expect((error as Error).message).not.toContain("shpat_secret_token");
  });
});
