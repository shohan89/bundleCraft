// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bodyEventId, readWebhookHeaders } from "./headers";
import { checkPayload } from "./payloads";
import { isWebhookTopic, WEBHOOK_ENDPOINTS, WEBHOOK_TOPICS } from "./registry";

describe("webhook registry vs shopify.app.toml", () => {
  const toml = readFileSync(join(process.cwd(), "shopify.app.toml"), "utf8");
  const blocks = [...toml.matchAll(/\[\[webhooks\.subscriptions\]\]([\s\S]*?)(?=\n\[|\n#|$)/g)].map(
    (match) => ({
      // `compliance_topics` is how the toml declares the mandatory privacy topics.
      topics: [
        ...(/(?:compliance_)?topics\s*=\s*\[([^\]]*)\]/.exec(match[1])?.[1] ?? "").matchAll(
          /"([^"]+)"/g,
        ),
      ].map((m) => m[1]),
      uri: /uri\s*=\s*"([^"]+)"/.exec(match[1])?.[1] ?? "",
    }),
  );

  it("declares exactly the subscriptions the registry expects, each at its own uri", () => {
    const declared = Object.fromEntries(blocks.map((b) => [b.uri, [...b.topics].sort()]));
    const expected = Object.fromEntries(
      WEBHOOK_ENDPOINTS.map((e) => [e.uri, [...e.topics].sort()]),
    );
    expect(declared).toEqual(expected);
  });

  it("every registered endpoint has a route file, and every topic appears once", () => {
    for (const { uri } of WEBHOOK_ENDPOINTS) {
      expect(existsSync(join(process.cwd(), "app", uri, "route.ts")), uri).toBe(true);
    }
    const all = WEBHOOK_ENDPOINTS.flatMap((e) => [...e.topics]);
    expect(all.sort()).toEqual([...WEBHOOK_TOPICS].sort());
  });

  it("covers the required MVP topics", () => {
    for (const topic of [
      "app/uninstalled",
      "orders/paid",
      "app_subscriptions/update",
      "products/create",
      "products/update",
      "products/delete",
      "customers/data_request",
      "customers/redact",
      "shop/redact",
    ]) {
      expect(isWebhookTopic(topic), topic).toBe(true);
    }
    expect(isWebhookTopic("orders/create")).toBe(false);
    expect(isWebhookTopic(null)).toBe(false);
  });
});

describe("webhook headers", () => {
  const headers = (init: Record<string, string>) => new Headers(init);

  it("reads topic, shop, event id and trigger time", () => {
    expect(
      readWebhookHeaders(
        headers({
          "x-shopify-topic": "orders/paid",
          "x-shopify-shop-domain": "a.myshopify.com",
          "x-shopify-event-id": "evt-123",
          "x-shopify-triggered-at": "2026-09-26T10:00:00Z",
          "x-shopify-hmac-sha256": "abc",
        }),
      ),
    ).toEqual({
      hmac: "abc",
      topic: "orders/paid",
      shopDomain: "a.myshopify.com",
      eventId: "evt-123",
      triggeredAt: new Date("2026-09-26T10:00:00Z"),
    });
  });

  it("falls back to the webhook id, and refuses unsafe or oversized ids", () => {
    expect(readWebhookHeaders(headers({ "x-shopify-webhook-id": "wh-1" })).eventId).toBe("wh-1");
    for (const bad of ["a b", "x".repeat(200), "'; DROP TABLE", "<script>", ""]) {
      expect(readWebhookHeaders(headers({ "x-shopify-event-id": bad })).eventId, bad).toBeNull();
    }
  });

  it("ignores an unparseable trigger time", () => {
    expect(
      readWebhookHeaders(headers({ "x-shopify-triggered-at": "yesterday" })).triggeredAt,
    ).toBeNull();
  });

  it("derives a stable id from the body when Shopify sends none", async () => {
    expect(await bodyEventId("{}")).toBe(await bodyEventId("{}"));
    expect(await bodyEventId("{}")).not.toBe(await bodyEventId("{ }"));
    expect(await bodyEventId("{}")).toMatch(/^body:[0-9a-f]{64}$/);
  });
});

describe("payload validation", () => {
  it("products: needs a numeric id, and yields the product gid", () => {
    for (const topic of ["products/create", "products/update", "products/delete"] as const) {
      expect(checkPayload(topic, { id: 123, title: "x" })).toEqual({
        ok: true,
        resourceId: "gid://shopify/Product/123",
      });
      expect(checkPayload(topic, { id: "456" })).toMatchObject({ ok: true });
      for (const bad of [{}, { id: "abc" }, { id: -1 }, { id: 1.5 }, null, "x", []]) {
        expect(checkPayload(topic, bad), JSON.stringify(bad)).toEqual({ ok: false });
      }
    }
  });

  it("subscription updates: need a well-formed AppSubscription id", () => {
    const gid = "gid://shopify/AppSubscription/42";
    expect(
      checkPayload("app_subscriptions/update", { app_subscription: { admin_graphql_api_id: gid } }),
    ).toEqual({
      ok: true,
      resourceId: gid,
    });
    for (const bad of [
      {},
      { app_subscription: {} },
      { app_subscription: { admin_graphql_api_id: "gid://shopify/Product/1" } },
      { app_subscription: { admin_graphql_api_id: "42; DROP" } },
    ]) {
      expect(checkPayload("app_subscriptions/update", bad)).toEqual({ ok: false });
    }
  });

  it("orders: need an order id and line items; uninstall needs only an object", () => {
    expect(checkPayload("orders/paid", { id: 9, line_items: [] })).toEqual({
      ok: true,
      resourceId: "gid://shopify/Order/9",
    });
    expect(checkPayload("orders/paid", { line_items: [] })).toEqual({ ok: false });
    expect(checkPayload("orders/paid", { id: 9 })).toEqual({ ok: false });
    expect(checkPayload("app/uninstalled", { id: 1, domain: "evil.com" })).toEqual({
      ok: true,
      resourceId: null,
    });
    expect(checkPayload("app/uninstalled", "x")).toEqual({ ok: false });
  });
});
