// @vitest-environment node
import "dotenv/config";
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSessionToken } from "@/lib/auth/session";
import {
  getAuthenticatedShop,
  getAuthenticatedShopForRequest,
  getAuthenticatedShopFromSessionToken,
} from "./shopify-auth";

const canRun =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.SESSION_SECRET) &&
  Boolean(process.env.SHOPIFY_API_KEY) &&
  Boolean(process.env.SHOPIFY_API_SECRET);
const API_KEY = process.env.SHOPIFY_API_KEY ?? "";
const API_SECRET = process.env.SHOPIFY_API_SECRET ?? "";
const DOMAIN_A = "bundlecraft-authtok-a.myshopify.com";
const DOMAIN_B = "bundlecraft-authtok-b.myshopify.com";

const base64url = (bytes: Buffer) =>
  bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encode = (value: unknown) => base64url(Buffer.from(JSON.stringify(value)));

function sessionTokenFor(
  shopDomain: string,
  over: Record<string, unknown> = {},
  secret = API_SECRET,
) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    iss: `https://${shopDomain}/admin`,
    dest: `https://${shopDomain}`,
    aud: API_KEY,
    sub: "1",
    exp: now + 60,
    nbf: now - 5,
    iat: now - 5,
    jti: crypto.randomUUID(),
    ...over,
  });
  const sig = base64url(createHmac("sha256", secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}
const request = (token?: string) =>
  new Request(
    "http://localhost/api/bundles",
    token ? { headers: { authorization: `Bearer ${token}` } } : {},
  );

describe.skipIf(!canRun)(
  "session-token authentication resolves the live shop (real database)",
  () => {
    let shopA: string;
    let shopB: string;

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

    afterAll(async () => {
      await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
      await prisma.$disconnect();
    }, 60_000);

    describe("getAuthenticatedShopFromSessionToken", () => {
      it("resolves the shop the token names, and only that shop's public fields", async () => {
        const shop = await getAuthenticatedShopFromSessionToken(sessionTokenFor(DOMAIN_A));
        expect(shop).toEqual({ id: shopA, shopDomain: DOMAIN_A, status: "active", plan: "free" });
      });

      it("is null for a forged, expired, wrong-audience or malformed token", async () => {
        for (const token of [
          sessionTokenFor(DOMAIN_A, {}, "wrong-secret"),
          sessionTokenFor(DOMAIN_A, { exp: Math.floor(Date.now() / 1000) - 10 }),
          sessionTokenFor(DOMAIN_A, { aud: "another-app-client-id" }),
          "not-a-token-at-all",
          "",
        ]) {
          expect(await getAuthenticatedShopFromSessionToken(token)).toBeNull();
        }
      });

      it("is null for a token naming a shop that was never installed", async () => {
        expect(
          await getAuthenticatedShopFromSessionToken(
            sessionTokenFor("nobody-installed-this.myshopify.com"),
          ),
        ).toBeNull();
      });

      it("is null once the shop is inactive (uninstalled), even with a perfectly valid token", async () => {
        await prisma.shop.update({ where: { id: shopB }, data: { status: "inactive" } });
        try {
          expect(await getAuthenticatedShopFromSessionToken(sessionTokenFor(DOMAIN_B))).toBeNull();
        } finally {
          await prisma.shop.update({ where: { id: shopB }, data: { status: "active" } });
        }
      });

      it("a token for shop A can never resolve to shop B (tenant isolation)", async () => {
        const shop = await getAuthenticatedShopFromSessionToken(sessionTokenFor(DOMAIN_A));
        expect(shop!.id).not.toBe(shopB);
      });
    });

    describe("getAuthenticatedShopForRequest (what authenticateApiRequest uses)", () => {
      it("a request with a valid bearer token authenticates from the token, cookie or not", async () => {
        const shop = await getAuthenticatedShopForRequest(
          request(sessionTokenFor(DOMAIN_A)),
          undefined,
        );
        expect(shop?.id).toBe(shopA);
      });

      it("a PRESENT but invalid bearer token fails even when a valid cookie for another (or the same) shop exists", async () => {
        const cookieForB = await createSessionToken(
          { shopId: shopB, shopDomain: DOMAIN_B },
          process.env.SESSION_SECRET!,
        );
        const forged = sessionTokenFor(DOMAIN_A, {}, "wrong-secret");
        expect(await getAuthenticatedShopForRequest(request(forged), cookieForB)).toBeNull();

        const cookieForA = await createSessionToken(
          { shopId: shopA, shopDomain: DOMAIN_A },
          process.env.SESSION_SECRET!,
        );
        expect(await getAuthenticatedShopForRequest(request(forged), cookieForA)).toBeNull();
      });

      it("falls back to the cookie only when there is no bearer token at all", async () => {
        const cookie = await createSessionToken(
          { shopId: shopA, shopDomain: DOMAIN_A },
          process.env.SESSION_SECRET!,
        );
        expect((await getAuthenticatedShopForRequest(request(), cookie))?.id).toBe(shopA);
        expect(await getAuthenticatedShopForRequest(request(), undefined)).toBeNull();
      });

      it("agrees with the cookie-only path when no bearer token is present", async () => {
        const cookie = await createSessionToken(
          { shopId: shopA, shopDomain: DOMAIN_A },
          process.env.SESSION_SECRET!,
        );
        expect(await getAuthenticatedShopForRequest(request(), cookie)).toEqual(
          await getAuthenticatedShop(cookie),
        );
      });
    });
  },
);
