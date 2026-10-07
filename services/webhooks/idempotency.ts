import type { WebhookTopic } from "@/lib/webhooks/registry";
import { prisma } from "@/lib/prisma";

/**
 * Durable, retry-safe idempotency for webhook events, backed by the unique
 * (shop, topic, event id) row in `webhook_events`.
 *
 * - First delivery: the insert wins, the caller processes the event.
 * - Redelivery of a finished event: `duplicate`, nothing is reprocessed.
 * - Redelivery while a first delivery is still running: `in_progress`. The
 *   route answers non-2xx so Shopify retries later instead of the event being lost.
 * - Redelivery after a failure, or after a run that died without finishing
 *   (no update for STALE_AFTER_MS): the row is taken over atomically, so exactly
 *   one retry proceeds even if several arrive together.
 *
 * A failed attempt is never recorded as processed. Marking done/failed is
 * guarded by the attempt number, so a slow, superseded attempt cannot overwrite
 * the result of the attempt that took over.
 */
export const STALE_AFTER_MS = 5 * 60 * 1000;

export type Claim =
  | { kind: "claimed"; id: string; attempt: number }
  | { kind: "duplicate" }
  | { kind: "in_progress" };

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";

export async function claimWebhookEvent(input: {
  shopId: string;
  topic: WebhookTopic;
  eventId: string;
  resourceId: string | null;
}): Promise<Claim> {
  const key = { shopId: input.shopId, topic: input.topic, eventId: input.eventId };

  try {
    const created = await prisma.webhookEvent.create({
      data: { ...key, resourceId: input.resourceId },
      select: { id: true },
    });
    return { kind: "claimed", id: created.id, attempt: 1 };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  const existing = await prisma.webhookEvent.findUniqueOrThrow({
    where: { shopId_topic_eventId: key },
    select: { id: true, status: true, attempts: true },
  });
  if (existing.status === "processed") return { kind: "duplicate" };

  const takeover = await prisma.webhookEvent.updateMany({
    where: {
      id: existing.id,
      attempts: existing.attempts,
      OR: [
        { status: "failed" },
        { status: "processing", updatedAt: { lt: new Date(Date.now() - STALE_AFTER_MS) } },
      ],
    },
    data: { status: "processing", attempts: { increment: 1 }, lastError: null },
  });
  return takeover.count === 1
    ? { kind: "claimed", id: existing.id, attempt: existing.attempts + 1 }
    : { kind: "in_progress" };
}

export async function markWebhookProcessed(claim: { id: string; attempt: number }): Promise<void> {
  await prisma.webhookEvent.updateMany({
    where: { id: claim.id, attempts: claim.attempt, status: "processing" },
    data: { status: "processed", processedAt: new Date(), lastError: null },
  });
}

export async function markWebhookFailed(
  claim: { id: string; attempt: number },
  errorCode: string,
): Promise<void> {
  await prisma.webhookEvent.updateMany({
    where: { id: claim.id, attempts: claim.attempt, status: "processing" },
    data: { status: "failed", lastError: errorCode.slice(0, 64) },
  });
}
