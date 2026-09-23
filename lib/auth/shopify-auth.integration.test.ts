// @vitest-environment node
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedShop } from "./shopify-auth";
import { createSessionToken } from "./session";

/**
 * Integration test against the real database configured in .env (the same
 * Supabase instance ACTION-002 migrated). Skipped entirely when no
 * DATABASE_URL/SESSION_SECRET is configured (e.g. a fresh checkout before
 * `.env` is filled in) rather than failing the suite.
 *
 * Creates its own throwaway Shop rows under clearly-marked test domains
 * and removes them in `afterAll`, regardless of pass/fail.
 */
const canRunLiveDbTest = Boolean(process.env.DATABASE_URL) && Boolean(process.env.SESSION_SECRET);

const TEST_DOMAIN_A = "bundlecraft-auth-test-shop-a.myshopify.com";
const TEST_DOMAIN_B = "bundlecraft-auth-test-shop-b.myshopify.com";

describe.skipIf(!canRunLiveDbTest)("getAuthenticatedShop (live database, tenant isolation)", () => {
  let shopAId: string;
  let shopBId: string;

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [TEST_DOMAIN_A, TEST_DOMAIN_B] } } });

    const shopA = await prisma.shop.create({
      data: {
        shopDomain: TEST_DOMAIN_A,
        accessToken: "test-encrypted-placeholder-a",
        email: "shop-a@example.com",
        status: "active",
      },
    });
    const shopB = await prisma.shop.create({
      data: {
        shopDomain: TEST_DOMAIN_B,
        accessToken: "test-encrypted-placeholder-b",
        email: "shop-b@example.com",
        status: "inactive",
      },
    });
    shopAId = shopA.id;
    shopBId = shopB.id;
  });

  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [TEST_DOMAIN_A, TEST_DOMAIN_B] } } });
    await prisma.$disconnect();
  });

  it("resolves a valid session to its own shop only", async () => {
    const token = await createSessionToken(
      { shopId: shopAId, shopDomain: TEST_DOMAIN_A },
      process.env.SESSION_SECRET!,
    );

    const resolved = await getAuthenticatedShop(token);

    expect(resolved).not.toBeNull();
    expect(resolved?.id).toBe(shopAId);
    expect(resolved?.shopDomain).toBe(TEST_DOMAIN_A);
  });

  it("never resolves shop A's session to shop B's record", async () => {
    const tokenA = await createSessionToken(
      { shopId: shopAId, shopDomain: TEST_DOMAIN_A },
      process.env.SESSION_SECRET!,
    );

    const resolved = await getAuthenticatedShop(tokenA);

    expect(resolved?.id).not.toBe(shopBId);
    expect(resolved?.shopDomain).not.toBe(TEST_DOMAIN_B);
  });

  it("rejects a session for an inactive (uninstalled) shop", async () => {
    const tokenForInactiveShop = await createSessionToken(
      { shopId: shopBId, shopDomain: TEST_DOMAIN_B },
      process.env.SESSION_SECRET!,
    );

    const resolved = await getAuthenticatedShop(tokenForInactiveShop);

    expect(resolved).toBeNull();
  });

  it("rejects a forged session whose shopId/shopDomain don't match the real record", async () => {
    const forgedToken = await createSessionToken(
      { shopId: shopAId, shopDomain: "attacker-controlled.myshopify.com" },
      process.env.SESSION_SECRET!,
    );

    const resolved = await getAuthenticatedShop(forgedToken);

    expect(resolved).toBeNull();
  });

  it("rejects a missing session", async () => {
    await expect(getAuthenticatedShop(undefined)).resolves.toBeNull();
  });
});
