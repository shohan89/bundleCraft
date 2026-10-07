// @vitest-environment node
import "dotenv/config";
import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  InvalidOAuthHmacError,
  InvalidOAuthStateError,
  InvalidShopError,
  MissingOAuthCodeError,
  TokenExchangeFailedError,
  completeOAuth,
  getAuthenticatedShop,
  getDecryptedAccessToken,
  startOAuth,
} from "./shopify-auth";

/**
 * The whole OAuth install path against the real database, with only
 * Shopify's two HTTP endpoints (token exchange, shop info) replaced. Proves
 * validation order, encryption at rest, and that the plaintext token never
 * leaves the server-side call chain. Not a live Shopify install.
 */
const canRun =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.SESSION_SECRET) &&
  Boolean(process.env.SHOPIFY_API_SECRET) &&
  Boolean(process.env.SHOPIFY_API_KEY) &&
  Boolean(process.env.SHOPIFY_APP_URL);
const SECRET = process.env.SHOPIFY_API_SECRET ?? "";
const DOMAIN = "bundlecraft-oauth-test.myshopify.com";
const TOKEN = "shpat_plaintext_access_token_1234567890";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function shopifyBehaves(token = TOKEN) {
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes("/admin/oauth/access_token")) {
      return new Response(JSON.stringify({ access_token: token, scope: "read_products" }), {
        status: 200,
      });
    }
    if (String(url).includes("/shop.json")) {
      return new Response(JSON.stringify({ shop: { email: "owner@example.com" } }), {
        status: 200,
      });
    }
    return new Response("{}", { status: 404 });
  });
}

/** A callback query signed exactly as Shopify signs it. */
function callbackQuery(over: Record<string, string> = {}): URLSearchParams {
  const params: Record<string, string> = {
    code: "auth-code",
    shop: DOMAIN,
    state: "state-123",
    timestamp: "1700000000",
    ...over,
  };
  const message = Object.entries(params)
    .filter(([key]) => key !== "hmac")
    .map(([key, value]) => `${key}=${value.replace(/%/g, "%25").replace(/&/g, "%26")}`)
    .sort()
    .join("&");
  return new URLSearchParams({
    ...params,
    hmac: over.hmac ?? createHmac("sha256", SECRET).update(message).digest("hex"),
  });
}

describe.skipIf(!canRun)("OAuth install flow (live database, fake Shopify HTTP)", () => {
  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: DOMAIN } });
  });
  afterEach(() => fetchMock.mockReset());
  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: DOMAIN } });
    await prisma.$disconnect();
  });

  it("start: only valid myshopify domains get an authorize URL, with a fresh unguessable state", () => {
    const a = startOAuth(DOMAIN);
    const b = startOAuth(DOMAIN);
    expect(a.authorizeUrl).toContain(`https://${DOMAIN}/admin/oauth/authorize`);
    expect(new URL(a.authorizeUrl).searchParams.get("state")).toBe(a.state);
    expect(a.state).not.toBe(b.state);
    expect(a.state.length).toBeGreaterThanOrEqual(24);
    for (const bad of [null, "", "evil.com", "a.myshopify.com.evil.com", "//x"]) {
      expect(() => startOAuth(bad)).toThrow(InvalidShopError);
    }
  });

  it("callback: rejects each invalid input before Shopify is contacted or anything is stored", async () => {
    shopifyBehaves();
    const cases: [string, () => Promise<unknown>, unknown][] = [
      [
        "bad shop",
        () => completeOAuth(callbackQuery({ shop: "evil.com" }), "state-123"),
        InvalidShopError,
      ],
      ["no state cookie", () => completeOAuth(callbackQuery(), undefined), InvalidOAuthStateError],
      ["wrong state", () => completeOAuth(callbackQuery(), "other-state"), InvalidOAuthStateError],
      [
        "forged hmac",
        () => completeOAuth(callbackQuery({ hmac: "00".repeat(32) }), "state-123"),
        InvalidOAuthHmacError,
      ],
      [
        "tampered parameter",
        () => {
          const q = callbackQuery();
          q.set("code", "different-code");
          return completeOAuth(q, "state-123");
        },
        InvalidOAuthHmacError,
      ],
      [
        "missing code",
        () => completeOAuth(callbackQuery({ code: "" }), "state-123"),
        MissingOAuthCodeError,
      ],
    ];
    for (const [name, run, expected] of cases) {
      await expect(run(), name).rejects.toBeInstanceOf(expected as never);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await prisma.shop.count({ where: { shopDomain: DOMAIN } })).toBe(0);
  });

  it("callback: a failed token exchange stores nothing and reveals no detail", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 400 }));
    const error = await completeOAuth(callbackQuery(), "state-123").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TokenExchangeFailedError);
    expect((error as Error).message).not.toMatch(/auth-code|secret|shpat/i);
    expect(await prisma.shop.count({ where: { shopDomain: DOMAIN } })).toBe(0);
  });

  it("callback: creates the shop, encrypts the token at rest, and returns only a session", async () => {
    shopifyBehaves();
    const result = await completeOAuth(callbackQuery(), "state-123");
    expect(result.shopDomain).toBe(DOMAIN);

    const row = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: DOMAIN } });
    expect(row.accessToken).not.toContain(TOKEN);
    expect(row.accessToken).not.toContain("shpat");
    expect(row).toMatchObject({ status: "active", plan: "free", email: "owner@example.com" });
    expect(await getDecryptedAccessToken(row.id)).toBe(TOKEN);

    // The session carries identity only, never the token.
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    const payload = Buffer.from(result.sessionToken.split(".")[0], "base64url").toString();
    expect(payload).not.toContain(TOKEN);
    expect(payload).toContain(row.id);

    const authenticated = await getAuthenticatedShop(result.sessionToken);
    expect(authenticated).toMatchObject({ id: row.id, shopDomain: DOMAIN });
    expect(JSON.stringify(authenticated)).not.toMatch(/accessToken|shpat/);
  });

  it("re-authorizing updates the same shop's token in place (no duplicate shop) and keeps its plan", async () => {
    await prisma.shop.update({ where: { shopDomain: DOMAIN }, data: { plan: "growth" } });
    shopifyBehaves("shpat_second_token_abcdefghij");
    await completeOAuth(callbackQuery({ code: "second-code" }), "state-123");

    expect(await prisma.shop.count({ where: { shopDomain: DOMAIN } })).toBe(1);
    const row = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: DOMAIN } });
    expect(row.plan).toBe("growth");
    expect(await getDecryptedAccessToken(row.id)).toBe("shpat_second_token_abcdefghij");
  });

  it("an uninstalled (inactive) shop's session stops working immediately", async () => {
    shopifyBehaves();
    const { sessionToken } = await completeOAuth(callbackQuery(), "state-123");
    expect(await getAuthenticatedShop(sessionToken)).not.toBeNull();
    await prisma.shop.update({ where: { shopDomain: DOMAIN }, data: { status: "inactive" } });
    expect(await getAuthenticatedShop(sessionToken)).toBeNull();
  });

  it("reinstalling after an uninstall reactivates the shop with a fresh token, but the old session stays dead", async () => {
    shopifyBehaves("shpat_after_uninstall_token_xyz");
    const before = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: DOMAIN } });
    await prisma.shop.update({
      where: { shopDomain: DOMAIN },
      data: { catalogSyncStatus: "synced", catalogSyncCursor: "stale-cursor" },
    });
    const { sessionToken: oldSession } = await completeOAuth(
      callbackQuery({ code: "c1" }),
      "state-123",
    );
    await new Promise((resolve) => setTimeout(resolve, 1100)); // session iat is whole seconds

    // What the app/uninstalled webhook does to the shop record.
    const uninstalledAt = new Date();
    await prisma.shop.update({
      where: { shopDomain: DOMAIN },
      data: { status: "inactive", accessToken: "", uninstalledAt },
    });
    expect(await getAuthenticatedShop(oldSession)).toBeNull();
    expect(await getDecryptedAccessToken(before.id)).toBeNull(); // no credentials to use

    await new Promise((resolve) => setTimeout(resolve, 1100));
    const { sessionToken: newSession } = await completeOAuth(
      callbackQuery({ code: "c2" }),
      "state-123",
    );

    const row = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: DOMAIN } });
    expect(row.status).toBe("active");
    // Products may have changed while the app was gone: the catalog is resynced from scratch.
    expect(row).toMatchObject({ catalogSyncStatus: "pending", catalogSyncCursor: null });
    expect(row.uninstalledAt?.getTime()).toBe(uninstalledAt.getTime()); // never cleared
    expect(row.installedAt.getTime()).toBeGreaterThan(uninstalledAt.getTime());
    expect(await getDecryptedAccessToken(row.id)).toBe("shpat_after_uninstall_token_xyz");
    expect(await getAuthenticatedShop(oldSession)).toBeNull();
    expect(await getAuthenticatedShop(newSession)).not.toBeNull();
  });
});
