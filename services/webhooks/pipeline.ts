import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { MAX_WEBHOOK_BODY_BYTES, readBoundedText } from "@/lib/api/body";
import { badSignatureLimiter } from "@/lib/api/limiters";
import { clientKey, rateLimitEnabled } from "@/lib/api/rate-limit";
import { prisma } from "@/lib/prisma";
import { bodyEventId, readWebhookHeaders } from "@/lib/webhooks/headers";
import { checkPayload } from "@/lib/webhooks/payloads";
import { COMPLIANCE_TOPICS, isWebhookTopic, type WebhookTopic } from "@/lib/webhooks/registry";
import { isValidShopDomain } from "@/services/shopify/oauth";
import { verifyWebhookHmac } from "@/services/shopify/webhooks";
import { HANDLERS } from "./handlers";
import { claimWebhookEvent, markWebhookFailed, markWebhookProcessed } from "./idempotency";
import { logWebhook, type WebhookOutcome } from "./log";

/** The uninstall itself and the privacy topics still matter once a shop is inactive. */
const FOR_INACTIVE_SHOPS: ReadonlySet<string> = new Set(["app/uninstalled", ...COMPLIANCE_TOPICS]);

const NO_STORE = { "Cache-Control": "no-store" };
const reply = (status: number, body: object = {}) =>
  NextResponse.json(body, { status, headers: NO_STORE });

/**
 * The one path every Shopify webhook takes. Order matters and is the security model:
 *
 *  1. body read with a hard size cap (413), as raw text
 *  2. HMAC verified over that raw text with the app secret (401). Nothing is
 *     parsed, looked up or logged from the request before this passes.
 *  3. topic must be one this endpoint serves; shop domain must be well formed
 *  4. JSON parsed (400), payload validated per topic
 *  5. shop resolved from the VERIFIED header, never from the payload. Unknown
 *     shops are acknowledged and ignored; inactive shops too, except for the
 *     uninstall event that makes them so
 *  6. idempotency claim (duplicate -> 200 no-op; still running -> 409 so Shopify retries)
 *  7. the topic handler runs; success is recorded, a throw is recorded as failed
 *     (never as processed) and answered 500 so Shopify retries
 *
 * Responses carry no internals. Things retrying can never fix (unknown shop or
 * topic, an unusable payload) are acknowledged with 200, because Shopify removes
 * subscriptions that keep failing; things a retry can fix return non-2xx.
 */
export async function handleWebhook(
  request: Request,
  served: readonly WebhookTopic[],
): Promise<Response> {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const ctx: { topic?: string | null; shopDomain?: string | null; eventId?: string | null } = {};

  const done = (
    status: number,
    outcome: WebhookOutcome,
    body: object = {},
    errorCode?: string,
  ): Response => {
    logWebhook({ requestId, outcome, status, ...ctx, errorCode, durationMs: Date.now() - started });
    return reply(status, body);
  };

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) return done(500, "failed", {}, "SECRET_NOT_CONFIGURED");

  const client = clientKey(request);
  if (rateLimitEnabled() && badSignatureLimiter.isLimited(client)) {
    return done(429, "rejected", {}, "RATE_LIMITED");
  }

  let raw: string;
  try {
    raw = await readBoundedText(request, MAX_WEBHOOK_BODY_BYTES);
  } catch (error) {
    const tooLarge = error instanceof ApiError && error.status === 413;
    return done(
      tooLarge ? 413 : 400,
      "rejected",
      {},
      tooLarge ? "PAYLOAD_TOO_LARGE" : "UNREADABLE_BODY",
    );
  }

  const headers = readWebhookHeaders(request.headers);
  if (!(await verifyWebhookHmac(raw, headers.hmac, secret))) {
    badSignatureLimiter.hit(client);
    return done(401, "rejected", {}, "INVALID_SIGNATURE");
  }

  // From here the request is known to come from Shopify.
  ctx.topic = headers.topic;
  ctx.shopDomain =
    headers.shopDomain && isValidShopDomain(headers.shopDomain) ? headers.shopDomain : null;

  const topic = headers.topic;
  if (!isWebhookTopic(topic) || !served.includes(topic)) {
    return done(200, "ignored", { ignored: true }, "UNKNOWN_TOPIC");
  }
  if (!ctx.shopDomain) return done(200, "ignored", { ignored: true }, "INVALID_SHOP");

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return done(400, "rejected", {}, "INVALID_JSON");
  }
  const checked = checkPayload(topic, payload);
  if (!checked.ok) return done(200, "ignored", { ignored: true }, "INVALID_PAYLOAD");

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: ctx.shopDomain },
    select: { id: true, shopDomain: true, status: true },
  });
  if (!shop) return done(200, "ignored", { ignored: true }, "UNKNOWN_SHOP");
  // Inactive (uninstalled) shops are ignored, except for the events that exist precisely for them.
  if (shop.status !== "active" && !FOR_INACTIVE_SHOPS.has(topic)) {
    return done(200, "ignored", { ignored: true }, "SHOP_INACTIVE");
  }

  const eventId = headers.eventId ?? (await bodyEventId(raw));
  ctx.eventId = eventId;

  try {
    const claim = await claimWebhookEvent({
      shopId: shop.id,
      topic,
      eventId,
      resourceId: checked.resourceId,
    });
    if (claim.kind === "duplicate") return done(200, "duplicate", { duplicate: true });
    if (claim.kind === "in_progress") return done(409, "in_progress", { inProgress: true });

    try {
      const result = await HANDLERS[topic]({
        shop,
        topic,
        eventId,
        resourceId: checked.resourceId,
        triggeredAt: headers.triggeredAt,
        payload,
      });
      await markWebhookProcessed(claim);
      return done(200, "processed", result);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "HANDLER_FAILED";
      await markWebhookFailed(claim, code).catch(() => undefined);
      return done(500, "failed", {}, code);
    }
  } catch {
    // The idempotency store itself failed: nothing was processed, so let Shopify retry.
    return done(500, "failed", {}, "STORE_UNAVAILABLE");
  }
}
