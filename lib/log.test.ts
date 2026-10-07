import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_LOGGED_MESSAGE,
  describeRequest,
  logEvent,
  logUnexpectedError,
  redact,
  requestIdFor,
  summarizeError,
} from "./log";

afterEach(() => vi.restoreAllMocks());

// Shopify-token-shaped fixtures are built at runtime (never a literal in source) so this file
// cannot itself trip a secret scanner: the shape is fake test data, not a real credential.
const fakeToken = (prefix: string, hex: string) => `${prefix}_${hex}`;

describe("redact", () => {
  it.each([
    [
      "a Shopify access token",
      `call failed for ${fakeToken("shp" + "at", "0123456789abcdef0123456789abcdef")}`,
      "shpat_0123",
    ],
    [
      "an app secret",
      `bad secret ${fakeToken("shp" + "ss", "abcdef0123456789abcdef")}`,
      "shpss_abcdef",
    ],
    ["a bearer value", "header Authorization: Bearer abc.def-ghi_jkl", "abc.def-ghi"],
    [
      "a connection string",
      "cannot reach postgresql://user:pa55word@db.example.com:5432/app",
      "pa55word",
    ],
    ["a credentialed URL", "GET https://user:hunter2@example.com/x failed", "hunter2"],
    ["key=value secrets", "access_token=abcd1234 and client_secret: zzz999", "abcd1234"],
    ["a cookie", "cookie=bundlecraft_session.abc123", "abc123"],
    ["an hmac", "hmac=deadbeefdeadbeef", "deadbeef"],
  ])("removes %s", (_name, text, secret) => {
    const out = redact(text);
    expect(out).not.toContain(secret);
    expect(out).toContain("[redacted]");
  });

  it("truncates long text", () => {
    const out = redact("x".repeat(5000));
    expect(out.length).toBeLessThanOrEqual(MAX_LOGGED_MESSAGE + 1);
  });

  it("leaves ordinary messages alone", () => {
    expect(redact("Unique constraint failed on the fields: (shop_id)")).toBe(
      "Unique constraint failed on the fields: (shop_id)",
    );
  });
});

describe("summarizeError", () => {
  it("keeps the class, a safe code and a scrubbed message; never the stack", () => {
    const error = Object.assign(new Error("boom with shpat_0123456789abcdef"), { code: "P2002" });
    const summary = summarizeError(error);
    expect(summary).toEqual({ name: "Error", code: "P2002", message: "boom with [redacted]" });
    expect(JSON.stringify(summary)).not.toContain(" at ");
  });

  it("ignores odd codes and non-errors", () => {
    expect(
      summarizeError(Object.assign(new Error("x"), { code: "a b c;drop" })).code,
    ).toBeUndefined();
    expect(summarizeError("just a string")).toEqual({ name: "NonError", message: "just a string" });
    expect(summarizeError({ secret: "shpat_0123456789abcdef" })).toEqual({
      name: "NonError",
      message: "unknown",
    });
  });
});

describe("request context", () => {
  it("describes only the route and method: no query string (it holds the App Proxy signature)", () => {
    const request = new Request(
      "https://app.example.com/api/storefront/cart?shop=a.myshopify.com&signature=abc123&timestamp=1",
      { method: "POST", headers: { cookie: "s=1", authorization: "Bearer x" }, body: "{}" },
    );
    expect(describeRequest(request)).toEqual({ route: "/api/storefront/cart", method: "POST" });
    expect(JSON.stringify(describeRequest(request))).not.toMatch(/signature|shop=|cookie|Bearer/);
  });

  it("accepts a well-formed incoming request id and replaces a hostile one", () => {
    const good = new Request("http://x", { headers: { "x-request-id": "req_ABC-123456" } });
    expect(requestIdFor(good)).toBe("req_ABC-123456");
    const bad = new Request("http://x", {
      headers: { "x-request-id": "<script>alert(1)</script>" },
    });
    expect(requestIdFor(bad)).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestIdFor()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("logEvent and logUnexpectedError", () => {
  it("writes one JSON line with primitives only, scrubbed", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logEvent("error", "thing_failed", {
      shopId: "s1",
      detail: "token shpat_0123456789abcdef",
      n: 3,
      skip: undefined,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ level: "error", event: "thing_failed", shopId: "s1", n: 3 });
    expect(line.detail).toBe("token [redacted]");
    expect("skip" in line).toBe(false);
    expect(typeof line.time).toBe("string");
  });

  it("logs an unexpected error with request id, route and error class, and no body, headers or stack", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = new Request("https://app.example.com/api/bundles?shop=x&signature=sig", {
      method: "POST",
      headers: { cookie: "session=abc", "x-request-id": "req-1234567890" },
      body: JSON.stringify({ customer: "Jane Doe", card: "4242" }),
    });
    const error = Object.assign(new Error("db said no at postgres://u:p@h/db"), { code: "P1001" });
    const id = logUnexpectedError("api_unexpected_error", error, request);

    expect(id).toBe("req-1234567890");
    const text = spy.mock.calls[0][0] as string;
    const line = JSON.parse(text);
    expect(line).toMatchObject({
      event: "api_unexpected_error",
      requestId: "req-1234567890",
      route: "/api/bundles",
      method: "POST",
      errorName: "Error",
      errorCode: "P1001",
    });
    for (const secret of ["sig", "session=abc", "Jane Doe", "4242", "u:p@h", "stack", "    at "]) {
      expect(text, secret).not.toContain(secret);
    }
  });
});
