// @vitest-environment node
import { describe, expect, it } from "vitest";
import { scriptSafeJson } from "@/lib/auth/script-safe";
import { SECURITY_HEADERS } from "@/lib/security-headers";
import { ApiError } from "./errors";
import { readBoundedText } from "./body";
import { readJsonBody } from "./guard";

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request("http://localhost/x", { method: "POST", body, headers });

describe("bounded body reading", () => {
  it("reads a body under the limit", async () => {
    expect(await readBoundedText(post("hello"), 10)).toBe("hello");
    expect(await readBoundedText(post(null), 10)).toBe("");
  });

  it("refuses a body over the limit with 413, by declared length and by actual bytes", async () => {
    const declared = post("x", { "content-length": "999999" });
    await expect(readBoundedText(declared, 10)).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      status: 413,
    });
    // A client that lies about (or omits) Content-Length is still cut off while streaming.
    await expect(readBoundedText(post("x".repeat(100)), 10)).rejects.toMatchObject({
      status: 413,
    });
  });

  it("counts bytes, not characters", async () => {
    await expect(readBoundedText(post("é".repeat(6)), 10)).rejects.toMatchObject({ status: 413 });
    expect(await readBoundedText(post("é".repeat(5)), 10)).toBe("é".repeat(5));
  });

  it("readJsonBody: 413 before parsing, 400 for bad JSON, value for good JSON", async () => {
    expect(await readJsonBody(post('{"a":1}'))).toEqual({ a: 1 });
    await expect(readJsonBody(post("{oops"))).rejects.toMatchObject({ status: 400 });
    const error = await readJsonBody(post(JSON.stringify({ big: "x".repeat(300_000) }))).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 413 });
  });
});

describe("security headers", () => {
  const header = (name: string) => SECURITY_HEADERS.find((h) => h.key === name)?.value;

  it("allows framing only by Shopify (embedded app) and never by other sites", () => {
    const csp = header("Content-Security-Policy")!;
    expect(csp).toContain("frame-ancestors https://admin.shopify.com https://*.myshopify.com");
    expect(csp).not.toMatch(/frame-ancestors[^;]*(\*\s|\*;|http:)/);
  });

  it("sets the standard hardening headers", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header("Strict-Transport-Security")).toMatch(/max-age=\d{7,}/);
    expect(header("Permissions-Policy")).toContain("camera=()");
  });

  it("is what next.config applies to every route", async () => {
    const config = (await import("../../next.config")).default;
    const rules = await config.headers!();
    expect(rules).toEqual([{ source: "/:path*", headers: SECURITY_HEADERS }]);
  });
});

describe("scriptSafeJson", () => {
  it("cannot break out of an inline script, whatever the value", () => {
    for (const value of [
      "</script><script>alert(1)</script>",
      "<!-- x",
      "a" + String.fromCharCode(0x2028) + "b" + String.fromCharCode(0x2029) + "c",
      '"; alert(1); "',
    ]) {
      const out = scriptSafeJson(value);
      expect(out).not.toContain("<");
      expect(
        out.includes(String.fromCharCode(0x2028)) || out.includes(String.fromCharCode(0x2029)),
      ).toBe(false);
      expect(JSON.parse(out)).toBe(value); // still decodes to the exact original
    }
  });
});
