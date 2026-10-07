// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { rawProduct } from "@/services/products/testing";
import { parseShopifyProduct } from "./shopify";
import { variantAvailability } from "./types";
import { parseProductId, parseProductQuery } from "./validation";

describe("parseShopifyProduct", () => {
  it("reduces a Shopify product to the fields BundleCraft stores, with numeric ids", () => {
    const product = parseShopifyProduct(
      rawProduct({
        id: 101,
        title: "Linen Shirt",
        vendor: "Acme",
        productType: "Shirt",
        variants: [
          { id: 1, title: "S", sku: "SKU-S", price: "45", compareAtPrice: "60.5" },
          { id: 2, title: "M", availableForSale: false, image: "https://cdn.shopify.com/m.png" },
        ],
      }),
    );
    expect(product).toMatchObject({
      shopifyProductId: "101",
      title: "Linen Shirt",
      handle: "product-101",
      status: "active",
      vendor: "Acme",
      productType: "Shirt",
      imageUrl: "https://cdn.shopify.com/p.png",
    });
    expect(product?.shopifyUpdatedAt).toEqual(new Date("2026-09-01T10:00:00Z"));
    expect(product?.variants).toEqual([
      {
        shopifyVariantId: "1",
        title: "S",
        sku: "SKU-S",
        price: "45.00",
        compareAtPrice: "60.50",
        availableForSale: true,
        imageUrl: null,
        position: 0,
      },
      {
        shopifyVariantId: "2",
        title: "M",
        sku: null,
        price: "19.00",
        compareAtPrice: null,
        availableForSale: false,
        imageUrl: "https://cdn.shopify.com/m.png",
        position: 1,
      },
    ]);
  });

  it("maps Shopify statuses and blanks to our values", () => {
    for (const [shopify, ours] of [
      ["ACTIVE", "active"],
      ["DRAFT", "draft"],
      ["ARCHIVED", "archived"],
    ] as const) {
      expect(parseShopifyProduct(rawProduct({ id: 1, status: shopify }))?.status).toBe(ours);
    }
    const blank = parseShopifyProduct(rawProduct({ id: 1, vendor: "  ", productType: "" }));
    expect(blank).toMatchObject({ vendor: null, productType: null });
  });

  it("never keeps a non-https image URL", () => {
    expect(
      parseShopifyProduct(rawProduct({ id: 1, image: "javascript:alert(1)" }))?.imageUrl,
    ).toBeNull();
    expect(
      parseShopifyProduct(rawProduct({ id: 1, image: "http://cdn.example.com/x.png" }))?.imageUrl,
    ).toBeNull();
    expect(
      parseShopifyProduct(
        rawProduct({ id: 1, variants: [{ id: 2, image: "data:text/html,<script>" }] }),
      )?.variants[0].imageUrl,
    ).toBeNull();
  });

  it("rejects anything malformed instead of half-storing it", () => {
    const good = rawProduct({ id: 5 });
    const bad: unknown[] = [
      null,
      "x",
      {},
      { ...good, id: "5" },
      { ...good, id: "gid://shopify/Order/5" },
      { ...good, id: "gid://shopify/Product/abc" },
      { ...good, status: "WEIRD" },
      { ...good, title: 42 },
      { ...good, updatedAt: "not a date" },
      { ...good, variants: null },
      { ...good, variants: { nodes: [{ id: "gid://shopify/ProductVariant/1" }] } },
      {
        ...good,
        variants: {
          nodes: [
            {
              id: "gid://shopify/ProductVariant/1",
              title: "x",
              price: "-5",
              availableForSale: true,
            },
          ],
        },
      },
      {
        ...good,
        variants: {
          nodes: [
            { id: "gid://shopify/Product/1", title: "x", price: "5", availableForSale: true },
          ],
        },
      },
    ];
    for (const value of bad) expect(parseShopifyProduct(value), JSON.stringify(value)).toBeNull();
  });

  it("rejects a duplicate variant id within a product, and oversized text", () => {
    expect(parseShopifyProduct(rawProduct({ id: 1, variants: [{ id: 3 }, { id: 3 }] }))).toBeNull();
    expect(parseShopifyProduct(rawProduct({ id: 1, title: "x".repeat(501) }))).toBeNull();
  });

  it("accepts a product with no variants (its variants are then all removed)", () => {
    expect(parseShopifyProduct(rawProduct({ id: 1, variants: [] }))?.variants).toEqual([]);
  });
});

describe("variantAvailability", () => {
  const live = { status: "active" };
  const variant = { removedAt: null, availableForSale: true };

  it("distinguishes available, sold out, unavailable and unknown", () => {
    expect(variantAvailability(live, variant)).toBe("available");
    expect(variantAvailability(live, { ...variant, availableForSale: false })).toBe("sold_out");
    for (const status of ["draft", "archived", "deleted"]) {
      expect(variantAvailability({ status }, variant)).toBe("unavailable");
    }
    expect(variantAvailability(live, { ...variant, removedAt: new Date() })).toBe("unavailable");
    expect(variantAvailability(null, null)).toBe("unknown");
    expect(variantAvailability(live, null)).toBe("unknown");
  });
});

describe("product query validation", () => {
  const parse = (query: string) => parseProductQuery(new URLSearchParams(query));

  it("applies defaults and accepts the supported filters", () => {
    expect(parse("")).toEqual({ page: 1, limit: 20 });
    expect(parse("search=shirt&status=active&vendor=Acme&productType=Tee&page=3&limit=50")).toEqual(
      {
        search: "shirt",
        status: "active",
        vendor: "Acme",
        productType: "Tee",
        page: 3,
        limit: 50,
      },
    );
    expect(parse("search=&vendor=")).toEqual({ page: 1, limit: 20 }); // empty means not given
  });

  it("rejects bad values, oversized pages and unknown parameters (including shopId)", () => {
    for (const bad of [
      "limit=51",
      "limit=0",
      "limit=abc",
      "page=0",
      "page=-1",
      "page=1.5",
      "status=deleted",
      "status=nope",
      `search=${"x".repeat(101)}`,
      "shopId=another-shop",
      "sort=title",
    ]) {
      expect(() => parse(bad), bad).toThrow(ApiError);
    }
  });

  it("validates product ids as uuids", () => {
    expect(parseProductId("5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11")).toBeTruthy();
    for (const bad of ["1", "abc", "' OR 1=1 --", "gid://shopify/Product/1"]) {
      expect(() => parseProductId(bad)).toThrow(ApiError);
    }
  });
});
