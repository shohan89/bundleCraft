// @vitest-environment node
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { BundleDraftInput } from "@/lib/bundles/types";
import { TEMPLATE_CATALOG } from "@/lib/templates/catalog";
import { prisma } from "@/lib/prisma";
import { grantPlan } from "@/services/billing/testing";
import { createBundle } from "@/services/bundles/create";
import { getBundle } from "@/services/bundles/get";
import { publishBundle } from "@/services/bundles/publish";
import { updateBundle } from "@/services/bundles/update";
import { seedCatalog } from "@/services/products/testing";
import { seedTemplates } from "./seed";
import {
  assertTemplateSelectable,
  getTemplate,
  getTemplateBySlug,
  getTemplateForBundle,
  listTemplates,
} from "./templates";

// Publishing syncs a Shopify discount (ACTION-007); that call is faked in memory.
vi.mock("@/services/discounts/gateway", async () => {
  const { fakeGateway } = await import("@/services/discounts/test-instance");
  return { openDiscountGateway: async () => fakeGateway };
});

const canRun = Boolean(process.env.DATABASE_URL);
const DOMAIN_A = "bundlecraft-templates-a.myshopify.com";
const DOMAIN_B = "bundlecraft-templates-b.myshopify.com";
const SLUGS = TEMPLATE_CATALOG.map((template) => template.slug);

const draft = (over: Partial<BundleDraftInput> = {}): BundleDraftInput => ({
  title: "From a template",
  description: null,
  bundleType: "fixed",
  templateId: null,
  requiredQuantity: null,
  discountType: "percentage",
  discountValue: 15,
  products: [{ shopifyProductId: "9001", shopifyVariantId: "90011", quantity: 1 }],
  customization: null,
  ...over,
});

const catalogRows = () => prisma.template.findMany({ where: { slug: { in: SLUGS } } });
const errorCode = async (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: { code?: string }) => error.code ?? "OTHER",
  );

describe.skipIf(!canRun)("template catalog in the database", () => {
  let shopA: string;
  let shopB: string;
  /** A retired template made just for these tests; the real catalog rows are never switched off. */
  const retired = { id: randomUUID(), slug: `test-retired-${randomUUID().slice(0, 8)}` };
  const broken = { id: randomUUID(), slug: `test-broken-${randomUUID().slice(0, 8)}` };

  beforeAll(async () => {
    await seedTemplates(prisma);
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    shopA = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN_A, accessToken: "x", email: "t@example.com" },
      })
    ).id;
    shopB = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN_B, accessToken: "x", email: "t@example.com" },
      })
    ).id;
    await grantPlan(shopA, "growth");
    await grantPlan(shopB, "growth");
    await seedCatalog(shopA, [{ productId: "9001", variantId: "90011" }]);
    await seedCatalog(shopB, [{ productId: "9001", variantId: "90011" }]);

    const config = TEMPLATE_CATALOG[0].configuration as unknown as object;
    await prisma.template.create({
      data: {
        ...retired,
        name: `Retired ${retired.slug}`,
        category: "fashion",
        configurationJson: config,
        isActive: false,
      },
    });
    await prisma.template.create({
      data: {
        ...broken,
        name: `Broken ${broken.slug}`,
        category: "beauty",
        configurationJson: { sections: ["top"] }, // the old, unvalidated shape
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.template.deleteMany({ where: { slug: { in: [retired.slug, broken.slug] } } });
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  });

  describe("seed", () => {
    it("has all five templates with the documented categories and names", async () => {
      const rows = await catalogRows();
      expect(rows).toHaveLength(5);
      const byName = Object.fromEntries(rows.map((row) => [row.slug, [row.name, row.category]]));
      expect(byName).toEqual({
        "complete-look": ["Complete Look", "fashion"],
        "weekend-outfit": ["Weekend Outfit", "fashion"],
        "seasonal-collection": ["Seasonal Collection", "fashion"],
        "skincare-routine": ["Skincare Routine", "beauty"],
        "hair-care-kit": ["Hair Care Kit", "beauty"],
      });
    });

    it("is idempotent: repeated runs add no rows and keep every id", async () => {
      const before = (await catalogRows()).map((row) => `${row.slug}:${row.id}`).sort();
      const total = await prisma.template.count();
      await seedTemplates(prisma);
      await seedTemplates(prisma);
      await seedTemplates(prisma);
      expect((await catalogRows()).map((row) => `${row.slug}:${row.id}`).sort()).toEqual(before);
      expect(await prisma.template.count()).toBe(total);
    });

    it("never duplicates a template, even when a stored name differs from the catalog", async () => {
      // Runs against a fake table so no real catalog row is edited while other tests run.
      const rows = new Map<string, Record<string, unknown>>();
      const fake = {
        template: {
          upsert: async ({
            where,
            update,
            create,
          }: {
            where: { slug: string };
            update: object;
            create: { slug: string };
          }) => {
            const existing = rows.get(where.slug);
            rows.set(where.slug, existing ? { ...existing, ...update } : { ...create });
            return rows.get(where.slug);
          },
        },
      } as unknown as Parameters<typeof seedTemplates>[0];

      await seedTemplates(fake);
      rows.set("complete-look", {
        ...rows.get("complete-look"),
        name: "Old renamed name",
        isActive: false,
      });
      await seedTemplates(fake);
      await seedTemplates(fake);

      expect(rows.size).toBe(5);
      expect(rows.get("complete-look")).toMatchObject({ name: "Complete Look", isActive: true });
    });

    it("keeps the id of an existing row so bundle references stay valid", async () => {
      const [row] = await prisma.template.findMany({ where: { slug: "complete-look" } });
      await seedTemplates(prisma);
      const after = await prisma.template.findUniqueOrThrow({ where: { slug: "complete-look" } });
      expect(after.id).toBe(row.id);
    });

    it("leaves templates outside the catalog alone", async () => {
      await seedTemplates(prisma);
      const still = await prisma.template.findUnique({ where: { slug: retired.slug } });
      expect(still?.isActive).toBe(false);
    });
  });

  describe("service", () => {
    it("lists the five active templates, Fashion first, and hides retired and unreadable ones", async () => {
      const list = await listTemplates();
      const own = list.filter((template) => SLUGS.includes(template.slug));
      expect(own.map((template) => template.name)).toEqual([
        "Complete Look",
        "Seasonal Collection",
        "Weekend Outfit",
        "Hair Care Kit",
        "Skincare Routine",
      ]);
      expect(list.map((template) => template.slug)).not.toContain(retired.slug);
      expect(list.map((template) => template.slug)).not.toContain(broken.slug);
    });

    it("filters by category", async () => {
      const fashion = await listTemplates({ category: "fashion" });
      const beauty = await listTemplates({ category: "beauty" });
      expect(fashion.every((template) => template.category === "fashion")).toBe(true);
      expect(beauty.every((template) => template.category === "beauty")).toBe(true);
      expect(fashion.filter((t) => SLUGS.includes(t.slug))).toHaveLength(3);
      expect(beauty.filter((t) => SLUGS.includes(t.slug))).toHaveLength(2);
    });

    it("gets a template by id and by slug, with validated defaults", async () => {
      const bySlug = await getTemplateBySlug("skincare-routine");
      const byId = await getTemplate(bySlug.id);
      expect(byId).toEqual(bySlug);
      expect(byId.bundleType).toBe("fixed");
      expect(byId.defaults.discountValue).toBe(15);
      expect(byId.sections.map((section) => section.label)).toEqual([
        "Cleanser",
        "Treatment",
        "Moisturizer",
        "SPF",
      ]);
    });

    it("treats unknown, retired and unreadable templates as not found", async () => {
      for (const id of [randomUUID(), retired.id, broken.id]) {
        expect(await errorCode(getTemplate(id))).toBe("TEMPLATE_NOT_FOUND");
      }
      expect(await errorCode(getTemplateBySlug("no-such-template"))).toBe("TEMPLATE_NOT_FOUND");
      expect(await errorCode(getTemplateBySlug(retired.slug))).toBe("TEMPLATE_NOT_FOUND");
    });

    it("can still describe a retired template for an existing bundle", async () => {
      const found = await getTemplateForBundle(retired.id);
      expect(found?.active).toBe(false);
      expect(found?.template.name).toBe(`Retired ${retired.slug}`);
      expect(await getTemplateForBundle(randomUUID())).toBeNull();
      expect(await getTemplateForBundle(broken.id)).toBeNull();
    });

    it("loads the whole catalog in one query", async () => {
      const spy = vi.spyOn(prisma.template, "findMany");
      await listTemplates();
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it("assertTemplateSelectable accepts an active template and refuses the rest", async () => {
      const active = await getTemplateBySlug("hair-care-kit");
      await expect(assertTemplateSelectable(active.id)).resolves.toBeUndefined();
      for (const id of [randomUUID(), retired.id, broken.id]) {
        expect(await errorCode(assertTemplateSelectable(id))).toBe("INVALID_TEMPLATE");
      }
    });
  });

  describe("bundles created from a template", () => {
    it("stores the template reference and exactly the submitted values, not the template's", async () => {
      const template = await getTemplateBySlug("seasonal-collection");
      // The merchant changed everything the template suggested.
      const created = await createBundle(
        shopA,
        draft({
          templateId: template.id,
          bundleType: "fixed",
          discountType: "fixed_amount",
          discountValue: 4,
        }),
        { verifyCatalog: true, verifyTemplate: true },
      );
      expect(created.templateId).toBe(template.id);
      expect(created).toMatchObject({
        bundleType: "fixed",
        requiredQuantity: null,
        discountType: "fixed_amount",
        discountValue: 4,
        status: "draft",
      });
    });

    it("changing a template later does not change bundles already made from it", async () => {
      const template = await getTemplateBySlug("weekend-outfit");
      const created = await createBundle(shopA, draft({ templateId: template.id }), {
        verifyCatalog: true,
        verifyTemplate: true,
      });
      const row = await prisma.template.findUniqueOrThrow({ where: { id: template.id } });
      await prisma.template.update({
        where: { id: template.id },
        data: { name: row.name }, // touch only updatedAt: catalog rows are shared, so no real edit
      });
      await seedTemplates(prisma);
      const after = await getBundle(shopA, created.id);
      expect(after).toMatchObject({ discountValue: 15, discountType: "percentage" });
      expect(after.templateId).toBe(template.id);
    });

    it("refuses an unknown, retired or unreadable template with a safe 422", async () => {
      for (const templateId of [randomUUID(), retired.id, broken.id]) {
        const error = await createBundle(shopA, draft({ templateId }), {
          verifyCatalog: true,
          verifyTemplate: true,
        }).catch((e: { code: string; status: number; message: string }) => e);
        expect(error).toMatchObject({ code: "INVALID_TEMPLATE", status: 422 });
        expect(JSON.stringify(error)).not.toMatch(/prisma|foreign key|constraint/i);
      }
    });

    it("still validates the bundle itself: a template cannot bypass the bundle rules", async () => {
      const template = await getTemplateBySlug("complete-look");
      expect(
        await errorCode(
          createBundle(shopA, draft({ templateId: template.id, discountValue: 150 }), {
            verifyCatalog: true,
            verifyTemplate: true,
          }),
        ),
      ).toBe("VALIDATION_ERROR");
      expect(
        await errorCode(
          createBundle(
            shopA,
            draft({
              templateId: template.id,
              products: [{ shopifyProductId: "123456", shopifyVariantId: "654321", quantity: 1 }],
            }),
            { verifyCatalog: true, verifyTemplate: true },
          ),
        ),
      ).toBe("VALIDATION_ERROR"); // a product that is not in this shop's catalog
    });

    it("a product of another shop's catalog is refused even with a valid template", async () => {
      await seedCatalog(shopB, [{ productId: "9002", variantId: "90021" }]);
      const template = await getTemplateBySlug("complete-look");
      expect(
        await errorCode(
          createBundle(
            shopA,
            draft({
              templateId: template.id,
              products: [{ shopifyProductId: "9002", shopifyVariantId: "90021", quantity: 1 }],
            }),
            { verifyCatalog: true, verifyTemplate: true },
          ),
        ),
      ).toBe("VALIDATION_ERROR");
    });

    it("moving a bundle to a retired template is refused, but keeping its current one is allowed", async () => {
      // A bundle that already points at a template that was retired afterwards.
      const created = await createBundle(shopA, draft({ templateId: retired.id }));
      expect(created.templateId).toBe(retired.id);

      const kept = await updateBundle(
        shopA,
        created.id,
        { title: "Renamed", templateId: retired.id },
        { verifyCatalog: true, verifyTemplate: true },
      );
      expect(kept).toMatchObject({ title: "Renamed", templateId: retired.id });

      const active = await getTemplateBySlug("hair-care-kit");
      const other = await createBundle(shopA, draft({ templateId: active.id }));
      expect(
        await errorCode(
          updateBundle(shopA, other.id, { templateId: retired.id }, { verifyTemplate: true }),
        ),
      ).toBe("INVALID_TEMPLATE");
      expect((await getBundle(shopA, other.id)).templateId).toBe(active.id);
    });

    it("a bundle on a retired template stays readable, and can be published under the normal rules", async () => {
      const created = await createBundle(shopA, draft({ templateId: retired.id }));
      const read = await getBundle(shopA, created.id);
      expect(read.templateId).toBe(retired.id);
      const published = await publishBundle(shopA, created.id);
      expect(published.status).toBe("active");
    });

    it("bundles without a template keep working", async () => {
      const created = await createBundle(shopA, draft({ templateId: null }), {
        verifyCatalog: true,
        verifyTemplate: true,
      });
      expect(created.templateId).toBeNull();
      expect((await publishBundle(shopA, created.id)).status).toBe("active");
    });

    it("deleting a template leaves the bundle, only clearing its reference (nothing is silently rewritten)", async () => {
      const gone = await prisma.template.create({
        data: {
          slug: `test-gone-${randomUUID().slice(0, 8)}`,
          name: `Gone ${randomUUID().slice(0, 8)}`,
          category: "fashion",
          configurationJson: TEMPLATE_CATALOG[0].configuration as unknown as object,
        },
      });
      const created = await createBundle(shopA, draft({ templateId: gone.id, title: "Keep me" }));
      await prisma.template.delete({ where: { id: gone.id } });
      const after = await getBundle(shopA, created.id);
      expect(after).toMatchObject({ title: "Keep me", templateId: null, discountValue: 15 });
    });
  });

  describe("tenant isolation", () => {
    it("another shop cannot change or read a bundle's template", async () => {
      const template = await getTemplateBySlug("skincare-routine");
      const created = await createBundle(shopA, draft({ templateId: template.id }));

      expect(
        await errorCode(
          updateBundle(shopB, created.id, { templateId: null }, { verifyTemplate: true }),
        ),
      ).toBe("BUNDLE_NOT_FOUND");
      expect(await errorCode(getBundle(shopB, created.id))).toBe("BUNDLE_NOT_FOUND");
      expect((await getBundle(shopA, created.id)).templateId).toBe(template.id);
    });

    it("both shops use the same template but get separate bundles", async () => {
      const template = await getTemplateBySlug("complete-look");
      const a = await createBundle(shopA, draft({ templateId: template.id, title: "A only" }));
      const b = await createBundle(shopB, draft({ templateId: template.id, title: "B only" }));
      expect(a.id).not.toBe(b.id);
      const rows = await prisma.bundle.findMany({
        where: { templateId: template.id, shopId: shopB },
      });
      expect(rows.map((row) => row.title)).toContain("B only");
      expect(rows.map((row) => row.title)).not.toContain("A only");
    });
  });
});
