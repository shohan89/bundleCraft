import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { clientKey, createRateLimiter, enforceRateLimit, rateLimitEnabled } from "./rate-limit";

const clock = () => {
  let time = 10_000;
  return { now: () => time, advance: (ms: number) => (time += ms) };
};

describe("createRateLimiter", () => {
  it("allows up to the limit in a window, then refuses with a retry time", () => {
    const c = clock();
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: c.now });
    expect([1, 2, 3].map(() => limiter.hit("k").allowed)).toEqual([true, true, true]);
    const refused = limiter.hit("k");
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(60);
    c.advance(45_000);
    expect(limiter.hit("k").retryAfterSeconds).toBe(15);
  });

  it("starts a fresh window afterwards", () => {
    const c = clock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: c.now });
    expect(limiter.hit("k").allowed).toBe(true);
    expect(limiter.hit("k").allowed).toBe(false);
    c.advance(1001);
    expect(limiter.hit("k").allowed).toBe(true);
  });

  it("counts each key on its own (one client cannot use up another client's allowance)", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.hit("shop-a:1.1.1.1").allowed).toBe(true);
    expect(limiter.hit("shop-a:1.1.1.1").allowed).toBe(false);
    expect(limiter.hit("shop-a:2.2.2.2").allowed).toBe(true);
    expect(limiter.hit("shop-b:1.1.1.1").allowed).toBe(true);
  });

  it("isLimited reports without counting", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    expect(limiter.isLimited("k")).toBe(false);
    limiter.hit("k");
    expect(limiter.isLimited("k")).toBe(false);
    limiter.hit("k");
    expect(limiter.isLimited("k")).toBe(true);
    for (let i = 0; i < 5; i++) limiter.isLimited("k");
    expect(limiter.hit("other").allowed).toBe(true);
  });

  it("is bounded in memory", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 100 });
    for (let i = 0; i < 1000; i++) limiter.hit(`key-${i}`);
    // The oldest keys were forgotten (their counters restart), and nothing grew without bound.
    expect(limiter.hit("key-0").allowed).toBe(true);
    expect(limiter.hit("key-999").allowed).toBe(false);
  });

  it("reset forgets everything", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.hit("k");
    limiter.reset();
    expect(limiter.hit("k").allowed).toBe(true);
  });
});

describe("enforceRateLimit", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("throws a 429 ApiError with Retry-After information once over the limit", () => {
    vi.stubEnv("RATE_LIMIT", "on");
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    enforceRateLimit(limiter, "k");
    let caught: unknown;
    try {
      enforceRateLimit(limiter, "k");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ code: "RATE_LIMITED", status: 429 });
    expect((caught as ApiError).options.retryAfterSeconds).toBeGreaterThan(0);
    expect((caught as ApiError).message).not.toMatch(/\d/); // nothing about internals
  });

  it("does nothing when switched off", () => {
    vi.stubEnv("RATE_LIMIT", "off");
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    for (let i = 0; i < 10; i++) enforceRateLimit(limiter, "k");
    expect(rateLimitEnabled()).toBe(false);
  });
});

describe("clientKey", () => {
  const req = (headers: Record<string, string>) => new Request("http://x", { headers });

  it("uses the first forwarded address", () => {
    expect(clientKey(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientKey(req({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("falls back to one shared bucket for missing or malformed values", () => {
    expect(clientKey(req({}))).toBe("unknown");
    for (const bad of ["<script>", "a b", "x".repeat(100), "not an ip!"]) {
      expect(clientKey(req({ "x-forwarded-for": bad })), bad).toBe("unknown");
    }
  });
});
