/**
 * The app's rate limiters in one place (see lib/api/rate-limit.ts for what they do and do not
 * cover). Route files may only export HTTP handlers, so the instances live here, which also lets
 * tests fill them.
 */
import { createRateLimiter } from "./rate-limit";

/** 120 storefront events a minute per shop and client: several widgets on a page send a handful each. */
export const eventLimiter = createRateLimiter({ limit: 120, windowMs: 60_000 });

/** 60 cart checks a minute per shop and client: far above any shopper, well below a loop. */
export const cartLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

/** 30 sign-in requests a minute per client on each OAuth route. */
export const oauthStartLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
export const oauthCallbackLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

/**
 * Bad webhook signatures: a client that keeps sending them is turned away before its body is even
 * read. Only FAILURES are counted, so genuine Shopify traffic, however heavy, is never limited.
 */
export const badSignatureLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
