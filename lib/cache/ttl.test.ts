import { afterEach, describe, expect, it, vi } from "vitest";
import { createTtlCache, ttlFromEnv } from "./ttl";

describe("createTtlCache", () => {
  const clock = () => {
    let time = 1_000;
    return { now: () => time, advance: (ms: number) => (time += ms) };
  };

  it("returns a stored value until it expires, then forgets it", () => {
    const c = clock();
    const cache = createTtlCache<string>({ ttlMs: 30_000, now: c.now });
    cache.set("a", "1");
    expect(cache.get("a")).toBe("1");
    c.advance(29_999);
    expect(cache.get("a")).toBe("1");
    c.advance(2);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0); // the expired entry is dropped, not kept
  });

  it("a ttl of 0 disables it completely", () => {
    const cache = createTtlCache<string>({ ttlMs: 0 });
    cache.set("a", "1");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("keeps keys apart (no value ever crosses keys)", () => {
    const cache = createTtlCache<string>({ ttlMs: 1000 });
    cache.set("shop-a.myshopify.com", "A");
    cache.set("shop-b.myshopify.com", "B");
    expect(cache.get("shop-a.myshopify.com")).toBe("A");
    expect(cache.get("shop-b.myshopify.com")).toBe("B");
    expect(cache.get("shop-c.myshopify.com")).toBeUndefined();
  });

  it("delete and clear remove entries", () => {
    const cache = createTtlCache<number>({ ttlMs: 1000 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("is bounded: at the cap the oldest entry is dropped", () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, maxEntries: 3 });
    for (const [i, key] of ["a", "b", "c", "d", "e"].entries()) cache.set(key, i);
    expect(cache.size).toBe(3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("e")).toBe(4);
  });

  it("refreshing a key does not evict others and extends its life", () => {
    const c = clock();
    const cache = createTtlCache<number>({ ttlMs: 1000, maxEntries: 2, now: c.now });
    cache.set("a", 1);
    cache.set("b", 2);
    c.advance(900);
    cache.set("a", 3);
    expect(cache.size).toBe(2);
    c.advance(200);
    expect(cache.get("a")).toBe(3);
    expect(cache.get("b")).toBeUndefined();
  });
});

describe("ttlFromEnv", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads milliseconds, and falls back for missing or invalid values", () => {
    vi.stubEnv("X_TTL", "5000");
    expect(ttlFromEnv("X_TTL", 1)).toBe(5000);
    vi.stubEnv("X_TTL", "0");
    expect(ttlFromEnv("X_TTL", 1)).toBe(0);
    for (const bad of ["", "abc", "-5", "NaN"]) {
      vi.stubEnv("X_TTL", bad);
      expect(ttlFromEnv("X_TTL", 42), bad).toBe(42);
    }
    expect(ttlFromEnv("X_NEVER_SET", 7)).toBe(7);
  });
});
