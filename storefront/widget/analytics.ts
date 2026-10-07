import type { TrackedEvent } from "@/lib/storefront/types";

export interface Tracker {
  /** Once per bundle per page load, however many times it re-renders. */
  view(bundleId: string): void;
  /** Call only after Shopify accepted the cart add. `instanceId` is the cart lines' `_bundle_instance_id`. */
  add(bundleId: string, instanceId?: string): void;
}

/** RFC 4122 v4 id. Purchases are deliberately absent: they are recorded server-side from the order. */
export function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [hex.slice(0, 4), hex.slice(4, 6), hex.slice(6, 8), hex.slice(8, 10), hex.slice(10)]
    .map((part) => part.join(""))
    .join("-");
}

/**
 * The widget's analytics client. UI code only ever calls `view` / `add`;
 * every event gets an idempotency id here, so if the network retries a
 * request the server still records one event. Fire-and-forget: sending is
 * never awaited by the shopper's action and a failure is swallowed, so
 * analytics can never block or break a cart add.
 */
export function createTracker(
  send: (event: TrackedEvent) => Promise<void>,
  newId: () => string = randomId,
): Tracker {
  const viewed = new Set<string>();
  const emit = (event: TrackedEvent) => {
    try {
      void send(event).catch(() => {});
    } catch {
      // A synchronous failure is also not the shopper's problem.
    }
  };

  return {
    view(bundleId) {
      if (viewed.has(bundleId)) return;
      viewed.add(bundleId);
      emit({ bundleId, event: "bundle_view", eventId: newId() });
    },
    add(bundleId, instanceId) {
      emit({
        bundleId,
        event: "bundle_add",
        eventId: newId(),
        ...(instanceId ? { instanceId } : {}),
      });
    },
  };
}
