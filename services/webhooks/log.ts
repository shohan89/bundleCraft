export type WebhookOutcome =
  "processed" | "duplicate" | "in_progress" | "ignored" | "rejected" | "failed";

export interface WebhookLog {
  requestId: string;
  outcome: WebhookOutcome;
  status: number;
  topic?: string | null;
  shopDomain?: string | null;
  eventId?: string | null;
  /** Short machine-readable reason. Never a message copied from an error, a payload or a header value. */
  errorCode?: string;
  durationMs: number;
}

/**
 * One structured line per webhook. It carries identifiers and the outcome and
 * nothing else: no payload, no HMAC, no token, no secret, no customer data.
 */
export function logWebhook(entry: WebhookLog): void {
  const line = JSON.stringify({ webhook: true, ...entry });
  if (entry.outcome === "failed") console.error(line);
  else if (entry.outcome === "rejected" || entry.outcome === "ignored") console.warn(line);
  else console.info(line);
}
