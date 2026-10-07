import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bearerTokenFrom, verifyShopifySessionToken } from "./session-token";

const API_KEY = "a0aa30cd251a62b6dcacbfa52cf5bc10";
const API_SECRET = "correct-horse-battery-staple-secret";
const SHOP = "bundlecraft-test.myshopify.com";

const base64url = (bytes: Buffer) =>
  bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encode = (value: unknown) => base64url(Buffer.from(JSON.stringify(value)));

/** Builds a session token exactly as Shopify would, or with whatever is overridden for a test. */
function makeToken({
  header = { alg: "HS256", typ: "JWT" },
  claims,
  secret = API_SECRET,
}: {
  header?: Record<string, unknown>;
  claims?: Record<string, unknown>;
  secret?: string;
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://${SHOP}/admin`,
    dest: `https://${SHOP}`,
    aud: API_KEY,
    sub: "1",
    exp: now + 60,
    nbf: now - 5,
    iat: now - 5,
    jti: "11111111-1111-1111-1111-111111111111",
    sid: "22222222-2222-2222-2222-222222222222",
    ...claims,
  };
  const h = encode(header);
  const p = encode(payload);
  const sig = base64url(createHmac("sha256", secret).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}

const verify = (token: string, apiSecret = API_SECRET) =>
  verifyShopifySessionToken(token, { apiKey: API_KEY, apiSecret });

describe("verifyShopifySessionToken", () => {
  it("accepts a valid token and returns the shop and expiry", async () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = await verify(makeToken());
    expect(claims).not.toBeNull();
    expect(claims!.shopDomain).toBe(SHOP);
    expect(claims!.expiresAt).toBeGreaterThan(now);
  });

  it("is case-insensitive on the shop domain and accepts dest without a trailing slash", async () => {
    const claims = await verify(makeToken({ claims: { dest: `https://${SHOP.toUpperCase()}` } }));
    expect(claims?.shopDomain).toBe(SHOP);
  });

  it("rejects an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await verify(makeToken({ claims: { exp: now - 1 } }))).toBeNull();
  });

  it("rejects a token that is not yet valid (nbf in the future)", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await verify(makeToken({ claims: { nbf: now + 60 } }))).toBeNull();
  });

  it("rejects a token issued in the future", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await verify(makeToken({ claims: { iat: now + 60 } }))).toBeNull();
  });

  it("tolerates small clock skew at the boundaries", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await verify(makeToken({ claims: { nbf: now + 3 } }))).not.toBeNull();
    expect(await verify(makeToken({ claims: { iat: now + 3 } }))).not.toBeNull();
  });

  it.each([
    ["not.two.dots.here", "wrong number of segments"],
    ["onlyonepart", "no dots at all"],
    ["", "an empty string"],
    ["a.b", "two segments"],
    ["a.b.c.d", "four segments"],
  ])("rejects %s (%s)", async (token) => {
    expect(await verify(token)).toBeNull();
  });

  it("rejects headers or payloads that are not valid base64url JSON", async () => {
    expect(await verify("not-base64!.eyJhIjoxfQ.sig")).toBeNull();
    const badPayload = `${Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url")}.not-json-at-all.sig`;
    expect(await verify(badPayload)).toBeNull();
  });

  it("rejects a missing or non-numeric/non-string required claim", async () => {
    for (const claims of [
      { exp: undefined },
      { nbf: undefined },
      { iat: undefined },
      { aud: undefined },
      { dest: undefined },
      { iss: undefined },
      { sub: undefined },
      { jti: undefined },
      { exp: "not-a-number" },
      { jti: "" },
    ]) {
      expect(await verify(makeToken({ claims })), JSON.stringify(claims)).toBeNull();
    }
  });

  it('rejects an algorithm other than HS256 (no alg-confusion), including a forged "none"', async () => {
    for (const alg of ["none", "HS512", "RS256", "hs256"]) {
      expect(await verify(makeToken({ header: { alg, typ: "JWT" } }))).toBeNull();
    }
  });

  it("rejects an unexpected token type", async () => {
    expect(await verify(makeToken({ header: { alg: "HS256", typ: "refresh" } }))).toBeNull();
  });

  it("accepts a missing typ (some issuers omit it), but nothing else", async () => {
    expect(await verify(makeToken({ header: { alg: "HS256" } }))).not.toBeNull();
  });

  it("rejects a forged signature: wrong secret, and a tampered payload with the original signature", async () => {
    expect(await verify(makeToken(), "a-different-secret")).toBeNull();
    const [h, p] = makeToken().split(".");
    const tampered = `${h}.${encode({
      iss: `https://${SHOP}/admin`,
      dest: `https://evil-shop.myshopify.com`,
      aud: API_KEY,
      sub: "1",
      exp: Math.floor(Date.now() / 1000) + 60,
      nbf: Math.floor(Date.now() / 1000) - 5,
      iat: Math.floor(Date.now() / 1000) - 5,
      jti: "x",
    })}.${makeToken().split(".")[2]}`;
    expect(await verify(tampered)).toBeNull();
    void p;
  });

  it("rejects the wrong audience (a token issued for a different app)", async () => {
    expect(await verify(makeToken({ claims: { aud: "different-client-id" } }))).toBeNull();
  });

  it("rejects a malformed, non-myshopify, or mismatched dest/iss", async () => {
    for (const claims of [
      { dest: "https://evil.example.com" },
      { dest: "http://bundlecraft-test.myshopify.com" }, // not https
      { dest: "https://bundlecraft-test.myshopify.com.evil.com" },
      { iss: `https://other-shop.myshopify.com/admin` }, // dest and iss disagree
      { iss: `https://${SHOP}` }, // iss missing /admin
    ]) {
      expect(await verify(makeToken({ claims })), JSON.stringify(claims)).toBeNull();
    }
  });

  it("never throws, whatever garbage it is given", async () => {
    for (const input of ["", "🙂".repeat(50), "null", "..", "a.".repeat(1000)]) {
      await expect(verify(input)).resolves.toBeNull();
    }
  });
});

describe("bearerTokenFrom", () => {
  const req = (authorization?: string) =>
    new Request("http://x", { headers: authorization ? { authorization } : {} });

  it("reads a well-formed Bearer header", () => {
    expect(bearerTokenFrom(req("Bearer abc.def.ghi"))).toBe("abc.def.ghi");
    expect(bearerTokenFrom(req("bearer abc"))).toBe("abc"); // scheme is case-insensitive
  });

  it("is null when absent or a different scheme", () => {
    expect(bearerTokenFrom(req())).toBeNull();
    expect(bearerTokenFrom(req("Basic dXNlcjpwYXNz"))).toBeNull();
    expect(bearerTokenFrom(req("Bearer"))).toBeNull();
    expect(bearerTokenFrom(req("Bearer   "))).toBeNull();
  });
});
