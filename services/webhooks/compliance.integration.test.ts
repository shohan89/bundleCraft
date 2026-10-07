// @vitest-environment node
import "dotenv/config";
import { createHmac, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as compliance } from "@/app/api/webhooks/compliance/route";
import { GET as storefrontBundles } from "@/app/api/storefront/bundles/route";
import { prisma } from "@/lib/prisma";
import { grantPlan } from "@/services/billing/testing";
import { seedCatalog } from "@/services/products/testing";

/**
 * Mandatory privacy webhooks (customers/data_request, customers/redact, shop/redact): real
 * database, real route handler, requests signed exactly as Shopify signs them. This proves our
 * behaviour, NOT live delivery from Shopify.
 */
const SECRET = process.env.SHOPIFY_API_SECRET ?? "";
const canRun = Boolean(process.env.DATABASE_URL) && Boolean(SECRET);
const DOMAIN_A = "bundlecraft-priv-a.myshopify.com";
const DOMAIN_B = "bundlecraft-priv-b.myshopify.com";

function send(
  topic: string,
  body: unknown,
  {
    shop = DOMAIN_A,
    hmac,
    eventId = randomUUID(),
  }: { shop?: string; hmac?: string; eventId?: string } = {},
) {
  const raw = JSON.stringify(body);
  return compliance(
    new Request("http://localhost/api/webhooks/compliance", {
      method: "POST",
      body: raw,
      headers: {
        "x-shopify-hmac-sha256": hmac ?? createHmac("sha256", SECRET).update(raw).digest("base64"),
        "x-shopify-topic": topic,
        "x-shopify-shop-domain": shop,
        "x-shopify-event-id": eventId,
      },
    }),
  );
}
const json = async (r: Response) => (await r.json()) as Record<string, unknown>;

describe.skipIf(!canRun)("privacy webhooks (live database, signed local requests)", () => {
  let shopA: string;
  let shopB: string;

  /** Everything the shop owns, counted table by table. */
  const owned = async (shopId: string) => ({
    shop: await prisma.shop.count({ where: { id: shopId } }),
    bundles: await prisma.bundle.count({ where: { shopId } }),
    bundleProducts: await prisma.bundleProduct.count({ where: { bundle: { shopId } } }),
    customizations: await prisma.customization.count({ where: { bundle: { shopId } } }),
    analytics: await prisma.analyticsEvent.count({ where: { shopId } }),
    subscriptions: await prisma.subscription.count({ where: { shopId } }),
    products: await prisma.product.count({ where: { shopId } }),
    variants: await prisma.productVariant.count({ where: { shopId } }),
    webhookEvents: await prisma.webhookEvent.count({ where: { shopId } }),
  });

  async function populate(shopId: string) {
    await grantPlan(shopId, "growth");
    await seedCatalog(shopId, [{ productId: "5001", variantId: "50011" }]);
    const bundle = await prisma.bundle.create({
      data: {
        shopId,
        title: "Private bundle",
        bundleType: "fixed",
        discountType: "percentage",
        discountValue: 10,
        status: "active",
        bundleProducts: {
          create: [
            { shopifyProductId: "5001", shopifyVariantId: "50011", quantity: 1, position: 0 },
          ],
        },
        customization: {
          create: {
            primaryColor: "#111827",
            buttonColor: "#111827",
            backgroundColor: "#ffffff",
            layout: "card",
            fontSize: 16,
          },
        },
      },
    });
    await prisma.analyticsEvent.create({
      data: {
        shopId,
        bundleId: bundle.id,
        eventType: "bundle_view",
        eventKey: `view:${randomUUID()}`,
      },
    });
    await prisma.analyticsEvent.create({
      data: {
        shopId,
        bundleId: bundle.id,
        eventType: "bundle_purchase",
        revenue: "30.00",
        currency: "USD",
        orderId: "gid://shopify/Order/1",
        eventKey: `order:${randomUUID()}`,
      },
    });
    await prisma.webhookEvent.create({
      data: { shopId, topic: "products/update", eventId: randomUUID(), status: "processed" },
    });
    return bundle.id;
  }

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
  }, 60_000);

  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.shop.updateMany({
      where: { id: { in: [shopA, shopB] } },
      data: { status: "active" },
    });
  });

  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  }, 60_000);

  describe("request verification", () => {
    it("rejects a bad or missing signature (401) and deletes nothing", async () => {
      await populate(shopA);
      await prisma.shop.update({ where: { id: shopA }, data: { status: "inactive" } });
      const before = await owned(shopA);
      for (const hmac of ["", "AAAA", "not base64!!"]) {
        const response = await send("shop/redact", { shop_domain: DOMAIN_A }, { hmac });
        expect(response.status, hmac).toBe(401);
      }
      expect(await owned(shopA)).toEqual(before);
    });
  });

  describe("customers/data_request and customers/redact", () => {
    it.each(["customers/data_request", "customers/redact"])(
      "%s: acknowledged, nothing to return or erase, nothing deleted, event recorded",
      async (topic) => {
        const before = await owned(shopA);
        const eventId = randomUUID();
        const response = await send(
          topic,
          {
            shop_id: 1,
            shop_domain: DOMAIN_A,
            customer: { id: 191167, email: "jane.doe@example.com", phone: "555-625-1199" },
            orders_requested: [299938, 280263],
            data_request: { id: 9999 },
          },
          { eventId },
        );
        expect(response.status).toBe(200);
        expect(await json(response)).toEqual({ customerDataHeld: false });

        const after = await owned(shopA);
        expect({ ...after, webhookEvents: 0 }).toEqual({ ...before, webhookEvents: 0 });
        const event = await prisma.webhookEvent.findFirstOrThrow({
          where: { shopId: shopA, topic, eventId },
        });
        expect(event.status).toBe("processed");
        // Only ids and outcome are kept: nothing from the body.
        expect(JSON.stringify(event)).not.toMatch(/jane|555-625|191167|example\.com/i);
      },
    );

    it("a redelivery is a no-op duplicate", async () => {
      const eventId = randomUUID();
      expect((await send("customers/redact", { customer: { id: 1 } }, { eventId })).status).toBe(
        200,
      );
      const again = await send("customers/redact", { customer: { id: 1 } }, { eventId });
      expect(await json(again)).toEqual({ duplicate: true });
    });

    it("is answered for an inactive (uninstalled) shop too, not ignored", async () => {
      await prisma.shop.update({ where: { id: shopA }, data: { status: "inactive" } });
      const response = await send("customers/data_request", { customer: { id: 2 } });
      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ customerDataHeld: false });
    });

    it("never logs the customer's data", async () => {
      const lines: string[] = [];
      for (const level of ["info", "warn", "error"] as const) {
        vi.spyOn(console, level).mockImplementation((line) => void lines.push(String(line)));
      }
      await send("customers/redact", { customer: { id: 5, email: "secret.person@example.com" } });
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join("\n")).not.toMatch(/secret\.person|example\.com/);
    });
  });

  describe("shop/redact", () => {
    it("erases every record of an uninstalled shop, and only that shop", async () => {
      const bundleA = await populate(shopA);
      await populate(shopB);
      await prisma.shop.update({
        where: { id: shopA },
        data: { status: "inactive", accessToken: "" },
      });
      const otherBefore = await owned(shopB);
      expect((await owned(shopA)).bundles).toBeGreaterThan(0);

      const response = await send("shop/redact", { shop_id: 954889, shop_domain: DOMAIN_A });
      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ redacted: true });

      expect(await owned(shopA)).toEqual({
        shop: 0,
        bundles: 0,
        bundleProducts: 0,
        customizations: 0,
        analytics: 0,
        subscriptions: 0,
        products: 0,
        variants: 0,
        webhookEvents: 0,
      });
      expect(await prisma.bundle.count({ where: { id: bundleA } })).toBe(0);
      expect(await owned(shopB)).toEqual(otherBefore); // untouched

      // Restore shop A for the remaining tests.
      shopA = (
        await prisma.shop.create({
          data: { shopDomain: DOMAIN_A, accessToken: "x", email: "a@example.com" },
        })
      ).id;
    });

    it("a repeat delivery after the erasure is acknowledged, not an error", async () => {
      const response = await send(
        "shop/redact",
        { shop_domain: DOMAIN_B },
        { shop: "bundlecraft-priv-gone.myshopify.com" },
      );
      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ ignored: true });
    });

    it("does nothing when the shop has reinstalled since (it is active again)", async () => {
      await populate(shopA);
      const before = await owned(shopA);
      const response = await send("shop/redact", { shop_domain: DOMAIN_A });
      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ redacted: false, reason: "reinstalled" });
      expect({ ...(await owned(shopA)), webhookEvents: 0 }).toEqual({
        ...before,
        webhookEvents: 0,
      });
    });

    it("takes the shop from the verified header, never from the payload", async () => {
      await prisma.shop.update({ where: { id: shopA }, data: { status: "inactive" } });
      const shopBBefore = await owned(shopB);
      // Signed for shop A; the body claims shop B.
      const response = await send(
        "shop/redact",
        { shop_id: 1, shop_domain: DOMAIN_B },
        { shop: DOMAIN_A },
      );
      expect(response.status).toBe(200);
      expect(await prisma.shop.count({ where: { id: shopA } })).toBe(0);
      expect(await owned(shopB)).toEqual(shopBBefore);
      shopA = (
        await prisma.shop.create({
          data: { shopDomain: DOMAIN_A, accessToken: "x", email: "a@example.com" },
        })
      ).id;
    });

    it("after the erasure the storefront serves nothing for that shop", async () => {
      await populate(shopB);
      await prisma.shop.update({ where: { id: shopB }, data: { status: "inactive" } });
      await send("shop/redact", { shop_domain: DOMAIN_B }, { shop: DOMAIN_B });
      const pairs: [string, string][] = [
        ["shop", DOMAIN_B],
        ["path_prefix", "/apps/bundlecraft"],
        ["timestamp", String(Math.floor(Date.now() / 1000))],
      ];
      const message = [...pairs]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => `${k}=${v}`)
        .join("");
      const signature = createHmac("sha256", SECRET).update(message).digest("hex");
      const response = await storefrontBundles(
        new Request(
          `http://localhost/api/storefront/bundles?${new URLSearchParams([...pairs, ["signature", signature]])}`,
        ),
      );
      expect(response.status).toBe(404);
      shopB = (
        await prisma.shop.create({
          data: { shopDomain: DOMAIN_B, accessToken: "x", email: "b@example.com" },
        })
      ).id;
    });
  });

  describe("what the database can hold about people", () => {
    it("has no shopper personal data columns anywhere (the claim the customer topics rely on)", async () => {
      const columns = (await prisma.$queryRawUnsafe(
        `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
      )) as { table_name: string; column_name: string }[];
      const personal = columns.filter(({ column_name }) =>
        /customer|phone|address|first_name|last_name|full_name|ip_address|user_agent|birth|zip|postal/i.test(
          column_name,
        ),
      );
      expect(personal).toEqual([]);
      // Emails: the merchant's own contact address on their shop record, and `users`, a standalone
      // table from the original schema that nothing in the app reads or writes.
      expect(
        columns
          .filter((c) => /email/i.test(c.column_name))
          .map((c) => `${c.table_name}.${c.column_name}`)
          .sort(),
      ).toEqual(["shops.email", "users.email"]);
      expect(await prisma.user.count()).toBe(0);
    });
  });
});
