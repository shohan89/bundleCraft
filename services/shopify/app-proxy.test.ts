// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { APP_PROXY_MAX_SKEW_SECONDS, isFreshTimestamp, verifyAppProxySignature } from "./app-proxy";

const SECRET = "shpss_test_secret";

/**
 * Independent reference implementation of Shopify's documented algorithm
 * (Node's crypto, not our Web Crypto code), so this isn't the module
 * grading itself. Repeated keys are comma-joined, pairs sorted by key and
 * concatenated with no separator.
 */
function reference(pairs: [string, string][], secret = SECRET): string {
  const grouped = new Map<string, string[]>();
  for (const [key, value] of pairs) grouped.set(key, [...(grouped.get(key) ?? []), value]);
  const message = [...grouped.keys()]
    .sort()
    .map((key) => `${key}=${grouped.get(key)!.join(",")}`)
    .join("");
  return createHmac("sha256", secret).update(message).digest("hex");
}

function signed(pairs: [string, string][], secret = SECRET): URLSearchParams {
  const params = new URLSearchParams(pairs);
  params.set("signature", reference(pairs, secret));
  return params;
}

const base: [string, string][] = [
  ["shop", "store-a.myshopify.com"],
  ["path_prefix", "/apps/bundlecraft"],
  ["timestamp", "1790000000"],
  ["bundleId", "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11"],
];

describe("verifyAppProxySignature", () => {
  it("accepts a correctly signed request", async () => {
    expect(await verifyAppProxySignature(signed(base), SECRET)).toBe(true);
  });

  it("is independent of parameter order", async () => {
    const shuffled = signed([...base].reverse());
    expect(await verifyAppProxySignature(shuffled, SECRET)).toBe(true);
  });

  it("handles repeated parameters by comma-joining their values", async () => {
    const withRepeats: [string, string][] = [...base, ["extra", "a"], ["extra", "b"]];
    expect(await verifyAppProxySignature(signed(withRepeats), SECRET)).toBe(true);
  });

  it("rejects a tampered shop (the cross-tenant attack) or any tampered parameter", async () => {
    const params = signed(base);
    params.set("shop", "store-b.myshopify.com");
    expect(await verifyAppProxySignature(params, SECRET)).toBe(false);

    const other = signed(base);
    other.set("bundleId", "00000000-0000-4000-8000-000000000000");
    expect(await verifyAppProxySignature(other, SECRET)).toBe(false);
  });

  it("rejects an added parameter, the wrong secret, and a missing signature", async () => {
    const added = signed(base);
    added.set("productId", "1");
    expect(await verifyAppProxySignature(added, SECRET)).toBe(false);
    expect(await verifyAppProxySignature(signed(base, "other-secret"), SECRET)).toBe(false);
    expect(await verifyAppProxySignature(new URLSearchParams(base), SECRET)).toBe(false);
  });
});

describe("isFreshTimestamp", () => {
  const now = 1_790_000_000;

  it("accepts a current timestamp within the allowed skew, either direction", () => {
    expect(isFreshTimestamp(String(now), now)).toBe(true);
    expect(isFreshTimestamp(String(now - APP_PROXY_MAX_SKEW_SECONDS), now)).toBe(true);
    expect(isFreshTimestamp(String(now + APP_PROXY_MAX_SKEW_SECONDS), now)).toBe(true);
  });

  it("rejects stale, future, missing and malformed timestamps", () => {
    expect(isFreshTimestamp(String(now - APP_PROXY_MAX_SKEW_SECONDS - 1), now)).toBe(false);
    expect(isFreshTimestamp(String(now + APP_PROXY_MAX_SKEW_SECONDS + 1), now)).toBe(false);
    expect(isFreshTimestamp(null, now)).toBe(false);
    expect(isFreshTimestamp("abc", now)).toBe(false);
    expect(isFreshTimestamp("-5", now)).toBe(false);
  });
});
