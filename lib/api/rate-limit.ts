/**
 * Lightweight, dependency-free rate limiting: a fixed window per key, held in memory.
 *
 * HONEST LIMITS. It is per process: on a serverless host every instance counts on its own, so
 * the effective ceiling is `limit` per instance, not global, and a restart forgets the counts.
 * It stops one abusive client from hammering an instance and bounds accidental loops (a widget
 * bug, a retry storm); it is NOT a defence against a distributed attack, which needs the
 * platform's edge protection or a shared store (the latter would be new infrastructure, which
 * this app deliberately does not add). Turn it off with RATE_LIMIT=off.
 *
 * The client key comes from `x-forwarded-for`, which a proxy in front of the app (Vercel,
 * Cloudflare) sets; without a trusted proxy a client can spoof it, which only lets it choose
 * its own bucket, never someone else's limit.
 */
import { ApiError } from "./errors";

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window ends (only meaningful when not allowed). */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Counts one request for `key` and says whether it is within the limit. */
  hit(key: string): RateLimitResult;
  /** Whether `key` is already over the limit, without counting a request. */
  isLimited(key: string): boolean;
  reset(): void;
}

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
  now?: () => number;
}): RateLimiter {
  const { limit, windowMs, maxKeys = 10_000, now = Date.now } = options;
  const windows = new Map<string, { count: number; resetAt: number }>();

  function current(key: string): { count: number; resetAt: number } {
    const time = now();
    const existing = windows.get(key);
    if (existing && existing.resetAt > time) return existing;
    if (!existing && windows.size >= maxKeys) {
      // Bounded memory: drop expired windows first, then the oldest.
      for (const [k, w] of windows) if (w.resetAt <= time) windows.delete(k);
      if (windows.size >= maxKeys) {
        const oldest = windows.keys().next().value;
        if (oldest !== undefined) windows.delete(oldest);
      }
    }
    const fresh = { count: 0, resetAt: time + windowMs };
    windows.set(key, fresh);
    return fresh;
  }

  const retryAfter = (resetAt: number) => Math.max(1, Math.ceil((resetAt - now()) / 1000));

  return {
    hit(key) {
      const window = current(key);
      window.count += 1;
      return window.count <= limit
        ? { allowed: true, retryAfterSeconds: 0 }
        : { allowed: false, retryAfterSeconds: retryAfter(window.resetAt) };
    },
    isLimited(key) {
      const window = windows.get(key);
      return Boolean(window && window.resetAt > now() && window.count >= limit);
    },
    reset() {
      windows.clear();
    },
  };
}

/** Rate limiting can be switched off (tests, local load runs). Read at call time. */
export const rateLimitEnabled = (): boolean => process.env.RATE_LIMIT !== "off";

const IP_SHAPE = /^[0-9a-fA-F:.]{2,45}$/;

/** The caller's address as reported by the proxy in front of the app, or "unknown". */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && IP_SHAPE.test(forwarded) ? forwarded : "unknown";
}

export const tooManyRequests = (retryAfterSeconds: number): ApiError =>
  new ApiError("RATE_LIMITED", "Too many requests. Please try again shortly.", 429, undefined, {
    retryAfterSeconds,
  });

/** Counts a request and throws a 429 `ApiError` when the key is over its limit. */
export function enforceRateLimit(limiter: RateLimiter, key: string): void {
  if (!rateLimitEnabled()) return;
  const result = limiter.hit(key);
  if (!result.allowed) throw tooManyRequests(result.retryAfterSeconds);
}
