import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./client";
import { CSRF_HEADER, CSRF_HEADER_VALUE } from "./csrf";

const ok = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200 });

function mockFetch() {
  const fn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
    ok({ ok: true }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.shopify;
});

describe("apiRequest and the embedded session token", () => {
  it("attaches Authorization: Bearer when App Bridge can supply a token, alongside the CSRF header", async () => {
    window.shopify = { idToken: vi.fn(async () => "a.b.c") };
    const fetchMock = mockFetch();

    await apiRequest("GET", "/api/bundles");

    const init = fetchMock.mock.calls[0][1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer a.b.c");
    expect(headers[CSRF_HEADER]).toBe(CSRF_HEADER_VALUE);
  });

  it("omits Authorization entirely outside the embedded admin (no window.shopify): unchanged, cookie-only behaviour", async () => {
    const fetchMock = mockFetch();

    await apiRequest("GET", "/api/bundles");

    const init = fetchMock.mock.calls[0][1]!;
    const headers = init.headers as Record<string, string>;
    expect("Authorization" in headers).toBe(false);
    expect(headers[CSRF_HEADER]).toBe(CSRF_HEADER_VALUE);
  });

  it("still works (cookie-only) when App Bridge's idToken fails", async () => {
    window.shopify = { idToken: vi.fn(async () => Promise.reject(new Error("not embedded"))) };
    const fetchMock = mockFetch();

    const result = await apiRequest("GET", "/api/bundles");

    expect(result.ok).toBe(true);
    const init = fetchMock.mock.calls[0][1]!;
    expect("Authorization" in (init.headers as Record<string, string>)).toBe(false);
  });

  it("never puts the token in the URL or the body", async () => {
    window.shopify = { idToken: vi.fn(async () => "secret.token.value") };
    const fetchMock = mockFetch();

    await apiRequest("POST", "/api/bundles", { title: "x" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain("secret.token.value");
    expect(String(init?.body ?? "")).not.toContain("secret.token.value");
  });
});
