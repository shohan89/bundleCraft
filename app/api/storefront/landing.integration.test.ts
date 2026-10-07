// @vitest-environment node
import "dotenv/config";
import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { BundleDraftInput } from "@/lib/bundles/types";
import type { StorefrontBundleCard } from "@/lib/storefront/types";
import { prisma } from "@/lib/prisma";
import { createBundle } from "@/services/bundles/create";
import { deactivateBundle, publishBundle } from "@/services/bundles/publish";
import { grantPlan } from "@/services/billing/testing";
import { seedCatalog } from "@/services/products/testing";
import { GET as bundlesRoute } from "./bundles/route";

// Publishing syncs a Shopify discount (ACTION-007); that call is faked in memory.
vi.mock("@/services/discounts/gateway", async () => {
  const { fakeGateway } = await import("@/services/discounts/test-instance");
  return { openDiscountGateway: async () => fakeGateway };
});

/**
 * Landing page projection (ACTION-013) against the real database and the real synced
 * catalog: only the App Proxy signature and Shopify's discount API are simulated.
 */
const canRun =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.SHOPIFY_API_SECRET) &&
  Boolean(process.env.SESSION_SECRET);
const SECRET = process.env.SHOPIFY_API_SECRET ?? "";
const DOMAIN_A = "bundlecraft-landing-a.myshopify.com";
const DOMAIN_B = "bundlecraft-landing-b.myshopify.com";
const BASE = "http://localhost/api/storefront/bundles";

interface Body {
  success: boolean;
  data?: { bundles: StorefrontBundleCard[] };
  error?: { code: string; message: string };
}

function signedUrl(extra: Record<string, string> = {}, shop = DOMAIN_A, secret = SECRET) {
  const pairs: [string, string][] = [
    ["shop", shop],
    ["path_prefix", "/apps/bundlecraft"],
    ["timestamp", String(Math.floor(Date.now() / 1000))],
    ...Object.entries(extra),
  ];
  const message = [...pairs]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("");
  const signature = createHmac("sha256", secret).update(message).digest("hex");
  return `${BASE}?${new URLSearchParams([...pairs, ["signature", signature]])}`;
}

const listing = async (shop = DOMAIN_A) => {
  const response = await bundlesRoute(new Request(signedUrl({ view: "listing" }, shop)));
  return { response, body: (await response.json()) as Body };
};

const input = (over: Partial<BundleDraftInput> & { title: string }): BundleDraftInput => ({
  description: null,
  bundleType: "fixed",
  templateId: null,
  requiredQuantity: null,
  discountType: "percentage",
  discountValue: 20,
  products: [],
  customization: null,
  ...over,
});
const line = (product: string, variant: string, quantity = 1) => ({
  shopifyProductId: product,
  shopifyVariantId: variant,
  quantity,
});

describe.skipIf(!canRun)("bundle landing page listing (live database, signed requests)", () => {
  let shopA: string;
  let shopB: string;

  const names = (cards: StorefrontBundleCard[]) => cards.map((card) => card.name);
  const byName = (cards: StorefrontBundleCard[], name: string) =>
    cards.find((card) => card.name === name)!;

  /** Creates and publishes a bundle, seeding its products first. */
  const publish = async (shop: string, over: Parameters<typeof input>[0]) => {
    const created = await createBundle(shop, input(over));
    await publishBundle(shop, created.id);
    return created.id;
  };

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    shopA = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN_A, accessToken: "x", email: "a@example.com" },
      })
    ).id;
    shopB = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN_B, accessToken: "x", email: "b@example.com" },
      })
    ).id;
    await grantPlan(shopA, "growth");
    await grantPlan(shopB, "growth");

    await seedCatalog(shopA, [
      { productId: "1", variantId: "11", title: "Shirt", price: "20.00" },
      { productId: "2", variantId: "21", title: "Scarf", price: "30.00" },
      { productId: "3", variantId: "31", title: "Hat", price: "10.00" },
      { productId: "4", variantId: "41", title: "Belt", price: "15.00" },
      { productId: "5", variantId: "51", title: "Socks", price: "5.00" },
      { productId: "6", variantId: "61", title: "Gloves", price: "8.00" },
    ]);
    // The same numeric ids in another shop are different rows with different data.
    await seedCatalog(shopB, [
      { productId: "1", variantId: "11", title: "B-shop secret product", price: "999.00" },
      { productId: "2", variantId: "21", title: "B-shop other", price: "999.00" },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  });

  describe("what is listed", () => {
    it("lists ONLY active bundles of the calling shop", async () => {
      await publish(shopA, {
        title: "Fixed Look",
        products: [line("1", "11"), line("2", "21")],
      });
      await createBundle(shopA, input({ title: "Draft One", products: [line("1", "11")] }));
      const inactive = await publish(shopA, {
        title: "Inactive One",
        products: [line("1", "11")],
      });
      await deactivateBundle(shopA, inactive);
      await publish(shopB, { title: "B-shop bundle", products: [line("1", "11")] });

      const { response, body } = await listing();
      const listed = names(body.data!.bundles);
      expect(response.status).toBe(200);
      expect(listed).toContain("Fixed Look");
      expect(listed).not.toContain("Draft One");
      expect(listed).not.toContain("Inactive One");
      expect(listed).not.toContain("B-shop bundle");

      expect(names((await listing(DOMAIN_B)).body.data!.bundles)).toEqual(["B-shop bundle"]);
    });

    it("drops a bundle from the list the moment it is deactivated and restores it on publish", async () => {
      const bundleId = await publish(shopA, { title: "Toggle", products: [line("3", "31")] });
      expect(names((await listing()).body.data!.bundles)).toContain("Toggle");
      await deactivateBundle(shopA, bundleId);
      expect(names((await listing()).body.data!.bundles)).not.toContain("Toggle");
      await publishBundle(shopA, bundleId);
      expect(names((await listing()).body.data!.bundles)).toContain("Toggle");
    });

    it("returns newest first and caps the list at 24 bundles", async () => {
      await prisma.bundle.deleteMany({ where: { shopId: shopB } });
      const ids: string[] = [];
      for (let i = 0; i < 26; i += 1) {
        const created = await createBundle(
          shopB,
          input({ title: `Bulk ${String(i).padStart(2, "0")}`, products: [line("1", "11")] }),
        );
        ids.push(created.id);
      }
      await prisma.bundle.updateMany({ where: { id: { in: ids } }, data: { status: "active" } });

      const cards = (await listing(DOMAIN_B)).body.data!.bundles;
      expect(cards).toHaveLength(24);
      const dates = await prisma.bundle.findMany({
        where: { id: { in: cards.map((c) => c.id) } },
        select: { id: true, createdAt: true },
      });
      const at = new Map(dates.map((d) => [d.id, d.createdAt.getTime()]));
      const times = cards.map((card) => at.get(card.id)!);
      expect(times).toEqual([...times].sort((a, b) => b - a));
      await prisma.bundle.deleteMany({ where: { shopId: shopB } });
    });
  });

  describe("card content", () => {
    it("shows real synced products, a display price for fixed bundles, and no private ids", async () => {
      await publish(shopA, {
        title: "Priced Fixed",
        description: "Shirt and scarf",
        products: [line("1", "11", 2), line("2", "21")],
      });
      const card = byName((await listing()).body.data!.bundles, "Priced Fixed");

      expect(card.description).toBe("Shirt and scarf");
      expect(card.type).toBe("fixed");
      expect(card.productCount).toBe(2);
      expect(card.preview).toEqual([
        { title: "Shirt", imageUrl: "https://cdn.shopify.com/p.png" },
        { title: "Scarf", imageUrl: "https://cdn.shopify.com/p.png" },
      ]);
      // (2 x 20 + 30) = 70, 20% off = 56 (the bundle engine's own math).
      expect(card.pricing).toEqual({ subtotal: 70, total: 56, savings: 14 });
      expect(card.availability).toBe("available");

      expect(Object.keys(card).sort()).toEqual(
        [
          "availability",
          "customization",
          "description",
          "discount",
          "id",
          "name",
          "preview",
          "pricing",
          "productCount",
          "requiredQuantity",
          "type",
        ].sort(),
      );
      expect(Object.keys(card.preview[0]).sort()).toEqual(["imageUrl", "title"]);
    });

    it("leaks nothing merchant-private or product-identifying beyond title and image", async () => {
      const { body, response } = await listing();
      const text = JSON.stringify(body);
      for (const forbidden of [
        "shopId",
        "shop_id",
        "accessToken",
        "shpat_",
        "shpss_",
        "templateId",
        "createdAt",
        "updatedAt",
        "email",
        "variantId",
        "productId",
        "revenue",
        "B-shop",
        "999.00",
      ]) {
        expect(text).not.toContain(forbidden);
      }
      expect(response.headers.get("cache-control")).toContain("max-age=30");
    });

    it("gives quantity and mix & match bundles no price (it depends on the selection)", async () => {
      await publish(shopA, {
        title: "Quantity Pack",
        bundleType: "quantity",
        requiredQuantity: 3,
        discountType: "fixed_amount",
        discountValue: 5,
        products: [line("3", "31"), line("4", "41")],
      });
      await publish(shopA, {
        title: "Mix Pack",
        bundleType: "mix_match",
        requiredQuantity: 2,
        products: [line("5", "51"), line("6", "61")],
      });
      const cards = (await listing()).body.data!.bundles;
      const quantity = byName(cards, "Quantity Pack");
      const mix = byName(cards, "Mix Pack");
      expect(quantity.pricing).toBeNull();
      expect(quantity.requiredQuantity).toBe(3);
      expect(quantity.discount).toEqual({ type: "fixed_amount", value: 5 });
      expect(mix.pricing).toBeNull();
      expect(mix.type).toBe("mix_match");
    });

    it("previews at most four distinct products and still reports the full count", async () => {
      await publish(shopA, {
        title: "Big Pack",
        bundleType: "mix_match",
        requiredQuantity: 2,
        products: [
          line("1", "11"),
          line("2", "21"),
          line("3", "31"),
          line("4", "41"),
          line("5", "51"),
          line("6", "61"),
        ],
      });
      const card = byName((await listing()).body.data!.bundles, "Big Pack");
      expect(card.preview).toHaveLength(4);
      expect(card.productCount).toBe(6);
    });

    it("does not price a fixed bundle whose product has no known price", async () => {
      await prisma.productVariant.update({
        where: { shopId_shopifyVariantId: { shopId: shopA, shopifyVariantId: "51" } },
        data: { price: null },
      });
      await publish(shopA, { title: "No Price", products: [line("5", "51"), line("6", "61")] });
      const card = byName((await listing()).body.data!.bundles, "No Price");
      expect(card.pricing).toBeNull();
      await prisma.productVariant.update({
        where: { shopId_shopifyVariantId: { shopId: shopA, shopifyVariantId: "51" } },
        data: { price: "5.00" },
      });
    });
  });

  describe("availability", () => {
    const setProduct = (productId: string, data: Record<string, unknown>) =>
      prisma.product.update({
        where: { shopId_shopifyProductId: { shopId: shopA, shopifyProductId: productId } },
        data,
      });
    const setVariant = (variantId: string, data: Record<string, unknown>) =>
      prisma.productVariant.update({
        where: { shopId_shopifyVariantId: { shopId: shopA, shopifyVariantId: variantId } },
        data,
      });
    const availability = async (name: string) =>
      byName((await listing()).body.data!.bundles, name).availability;

    it("fixed: sold out, unavailable and unknown never read as purchasable", async () => {
      await publish(shopA, { title: "Avail Fixed", products: [line("1", "11"), line("2", "21")] });
      expect(await availability("Avail Fixed")).toBe("available");

      await setVariant("21", { availableForSale: false });
      expect(await availability("Avail Fixed")).toBe("sold_out");

      await setProduct("2", { status: "draft" });
      expect(await availability("Avail Fixed")).toBe("unavailable");
      await setProduct("2", { status: "archived" });
      expect(await availability("Avail Fixed")).toBe("unavailable");
      await setProduct("2", { status: "deleted", deletedAt: new Date() });
      expect(await availability("Avail Fixed")).toBe("unavailable");

      await setProduct("2", { status: "active", deletedAt: null });
      await setVariant("21", { availableForSale: true, removedAt: new Date() });
      expect(await availability("Avail Fixed")).toBe("unavailable");
      await setVariant("21", { removedAt: null });
      expect(await availability("Avail Fixed")).toBe("available");
    });

    it("fixed: a product that is not in the catalog makes the state unknown, not available", async () => {
      await seedCatalog(shopA, [{ productId: "77", variantId: "771" }]);
      await publish(shopA, {
        title: "Unknown Fixed",
        products: [line("1", "11"), line("77", "771")],
      });
      await prisma.productVariant.deleteMany({ where: { shopId: shopA, shopifyVariantId: "771" } });
      expect(await availability("Unknown Fixed")).toBe("unknown");
    });

    it("mix & match: one buyable product keeps it available; none buyable does not", async () => {
      await publish(shopA, {
        title: "Avail Mix",
        bundleType: "mix_match",
        requiredQuantity: 1,
        products: [line("5", "51"), line("6", "61")],
      });
      expect(await availability("Avail Mix")).toBe("available");

      await setVariant("51", { availableForSale: false });
      expect(await availability("Avail Mix")).toBe("available");

      await setVariant("61", { availableForSale: false });
      expect(await availability("Avail Mix")).toBe("sold_out");

      await setProduct("5", { status: "draft" });
      await setProduct("6", { status: "archived" });
      expect(await availability("Avail Mix")).toBe("unavailable");

      await setProduct("5", { status: "active" });
      await setProduct("6", { status: "active" });
      await setVariant("51", { availableForSale: true });
      await setVariant("61", { availableForSale: true });
    });

    it("uses this shop's catalog only: another shop's product with the same ids is invisible", async () => {
      await publish(shopA, { title: "Tenant", products: [line("1", "11")] });
      const card = byName((await listing()).body.data!.bundles, "Tenant");
      expect(card.preview[0].title).toBe("Shirt");
      expect(JSON.stringify(card)).not.toContain("B-shop");
    });
  });

  describe("efficiency", () => {
    it("reads the catalog once for the whole list (no per-bundle or per-product queries)", async () => {
      await publish(shopA, { title: "Perf 1", products: [line("1", "11"), line("2", "21")] });
      await publish(shopA, { title: "Perf 2", products: [line("3", "31"), line("4", "41")] });
      await publish(shopA, {
        title: "Perf 3",
        bundleType: "mix_match",
        requiredQuantity: 1,
        products: [line("5", "51"), line("6", "61")],
      });

      const variants = vi.spyOn(prisma.productVariant, "findMany");
      const bundles = vi.spyOn(prisma.bundle, "findMany");
      const products = vi.spyOn(prisma.product, "findMany");
      const { body } = await listing();
      expect(body.data!.bundles.length).toBeGreaterThanOrEqual(3);
      expect(variants).toHaveBeenCalledTimes(1);
      expect(bundles).toHaveBeenCalledTimes(1);
      expect(products).not.toHaveBeenCalled();
    });
  });

  describe("request handling", () => {
    it("requires the App Proxy signature", async () => {
      expect(
        (await bundlesRoute(new Request(`${BASE}?shop=${DOMAIN_A}&view=listing`))).status,
      ).toBe(401);
      const wrong = signedUrl({ view: "listing" }, DOMAIN_A, "wrong-secret");
      expect((await bundlesRoute(new Request(wrong))).status).toBe(401);
    });

    it("cannot be pointed at another shop by editing the shop parameter", async () => {
      const forged = signedUrl({ view: "listing" }).replace(DOMAIN_A, DOMAIN_B);
      const response = await bundlesRoute(new Request(forged));
      expect(response.status).toBe(401);
      expect(JSON.stringify(await response.json())).not.toContain("B-shop");
    });

    it("ignores a client-supplied shop id: the signed shop decides", async () => {
      await publish(shopB, { title: "B-shop again", products: [line("1", "11")] });
      const response = await bundlesRoute(
        new Request(signedUrl({ view: "listing", shopId: shopB })),
      );
      const body = (await response.json()) as Body;
      expect(response.status).toBe(200);
      expect(names(body.data!.bundles)).not.toContain("B-shop again");
      await prisma.bundle.updateMany({ where: { shopId: shopB }, data: { status: "inactive" } });
    });

    it("rejects an unknown view and a view combined with a filter", async () => {
      const cases: Record<string, string>[] = [
        { view: "everything" },
        { view: "listing", bundleId: "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11" },
        { view: "listing", productId: "1" },
      ];
      for (const extra of cases) {
        const response = await bundlesRoute(new Request(signedUrl(extra)));
        expect(response.status, JSON.stringify(extra)).toBe(400);
      }
    });

    it("keeps the unfiltered and per-bundle responses working as before", async () => {
      const plain = await bundlesRoute(new Request(signedUrl()));
      const body = (await plain.json()) as { data: { bundles: Record<string, unknown>[] } };
      expect(plain.status).toBe(200);
      expect(body.data.bundles[0]).toHaveProperty("customization");

      const id = body.data.bundles[0].id as string;
      const detail = await bundlesRoute(new Request(signedUrl({ bundleId: id })));
      const one = (await detail.json()) as { data: { bundles: { products: unknown[] }[] } };
      expect(detail.status).toBe(200);
      expect(one.data.bundles[0].products.length).toBeGreaterThan(0);
    });

    it("returns an empty list (not an error) for a shop with no active bundles", async () => {
      await prisma.bundle.updateMany({ where: { shopId: shopB }, data: { status: "inactive" } });
      const { response, body } = await listing(DOMAIN_B);
      expect(response.status).toBe(200);
      expect(body.data!.bundles).toEqual([]);
    });
  });
});
