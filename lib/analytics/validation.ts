/**
 * Input validation for analytics. Everything from a browser, a query string
 * or a webhook body is untrusted: shapes are checked strictly, unknown keys
 * are rejected, and the caller (never the payload) decides which shop the
 * data belongs to. Nothing here accepts a shop id or a revenue figure from
 * a client.
 */
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import type { AnalyticsFilters } from "./types";
import { CLIENT_EVENT_TYPES } from "./types";

const invalid = (message = "Invalid request.") => new ApiError("INVALID_REQUEST", message, 400);

/** A UUID as the storefront generates it (crypto.randomUUID). */
const uuid = z.uuid();

const clientEventSchema = z
  .object({
    bundleId: uuid,
    event: z.enum(CLIENT_EVENT_TYPES),
    /** Idempotency key: a retry of the same browser action sends the same id. */
    eventId: uuid,
    /** The `_bundle_instance_id` the cart lines carry; ties an add to a later purchase. */
    instanceId: uuid.optional(),
  })
  .strict();

export type ClientEventInput = z.infer<typeof clientEventSchema>;

export function parseClientEvent(body: unknown): ClientEventInput {
  const result = clientEventSchema.safeParse(body);
  if (!result.success) throw invalid();
  return result.data;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const DAY_MS = 86_400_000;

function parseBoundary(raw: string, edge: "start" | "end", name: string): Date {
  let date: Date;
  if (DATE_ONLY.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    date = new Date(Date.UTC(year, month - 1, day));
    // Rejects rolled-over dates such as 2026-02-31.
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw invalid(`${name} is not a valid date.`);
    }
    // A bare end date includes that whole day.
    if (edge === "end") date = new Date(date.getTime() + DAY_MS - 1);
  } else {
    if (!z.iso.datetime({ offset: true }).safeParse(raw).success) {
      throw invalid(`${name} must be a date (YYYY-MM-DD) or an ISO 8601 timestamp.`);
    }
    date = new Date(raw);
  }
  const year = date.getUTCFullYear();
  if (Number.isNaN(date.getTime()) || year < MIN_YEAR || year > MAX_YEAR) {
    throw invalid(`${name} is out of range.`);
  }
  return date;
}

/**
 * `startDate`, `endDate` (both optional, inclusive) and `bundleId` (optional)
 * from a query string. Any other parameter — including a `shopId` — is
 * ignored: the shop always comes from the authenticated session.
 */
export function parseAnalyticsFilters(params: URLSearchParams): AnalyticsFilters {
  const startRaw = params.get("startDate");
  const endRaw = params.get("endDate");
  const bundleRaw = params.get("bundleId");

  const from = startRaw ? parseBoundary(startRaw, "start", "startDate") : null;
  const to = endRaw ? parseBoundary(endRaw, "end", "endDate") : null;
  if (from && to && from.getTime() > to.getTime()) {
    throw invalid("startDate must not be after endDate.");
  }

  let bundleId: string | null = null;
  if (bundleRaw) {
    if (!uuid.safeParse(bundleRaw).success) throw invalid("bundleId is not valid.");
    bundleId = bundleRaw;
  }
  return { from, to, bundleId };
}
