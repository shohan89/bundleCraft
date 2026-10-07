import { afterEach, describe, expect, it, vi } from "vitest";
import { getBrowserSessionToken } from "./browser-session-token";

afterEach(() => {
  delete window.shopify;
});

describe("getBrowserSessionToken", () => {
  it("returns the token App Bridge provides", async () => {
    window.shopify = { idToken: vi.fn(async () => "a.b.c") };
    expect(await getBrowserSessionToken()).toBe("a.b.c");
  });

  it("is null when App Bridge has not loaded (window.shopify absent)", async () => {
    expect(await getBrowserSessionToken()).toBeNull();
  });

  it("is null when window.shopify exists but has no idToken function", async () => {
    // @ts-expect-error -- deliberately the wrong shape
    window.shopify = { somethingElse: true };
    expect(await getBrowserSessionToken()).toBeNull();
  });

  it("is null when idToken rejects, instead of throwing", async () => {
    window.shopify = { idToken: vi.fn(async () => Promise.reject(new Error("no shop"))) };
    await expect(getBrowserSessionToken()).resolves.toBeNull();
  });

  it("is null when idToken resolves to something that is not a non-empty string", async () => {
    for (const value of ["", null, undefined, 123] as const) {
      window.shopify = { idToken: vi.fn(async () => value as unknown as string) };
      expect(await getBrowserSessionToken()).toBeNull();
    }
  });
});
