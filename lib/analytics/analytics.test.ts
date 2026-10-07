// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { conversionRate, formatConversion, formatRevenue, hasActivity, toTotals } from "./metrics";
import { extractBundlePurchases } from "./purchase";
import { parseAnalyticsFilters, parseClientEvent } from "./validation";

const B1 = "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11";
const B2 = "6a1d7b7f-9f1f-4d64-8c75-7a8a4a3c0b22";
const I1 = "11111111-1111-4111-8111-111111111111";
const I2 = "22222222-2222-4222-8222-222222222222";

describe("conversion rate", () => {
  it("is purchases / views * 100", () => {
    expect(conversionRate(100, 10)).toBe(10);
    expect(conversionRate(3, 1)).toBe(33.33);
  });

  it("is 0, never NaN or Infinity, when there are no views or no purchases", () => {
    expect(conversionRate(0, 0)).toBe(0);
    expect(conversionRate(0, 5)).toBe(0);
    expect(conversionRate(10, 0)).toBe(0);
    for (const value of [conversionRate(0, 0), conversionRate(0, 3), conversionRate(NaN, 1)]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("toTotals assembles the five MVP metrics and orders revenue", () => {
    const totals = toTotals({ bundle_view: 100, bundle_add: 40, bundle_purchase: 10 }, [
      { currency: "EUR", amount: 20 },
      { currency: "USD", amount: 120.5 },
      { currency: "GBP", amount: 0 },
    ]);
    expect(totals).toEqual({
      views: 100,
      adds: 40,
      purchases: 10,
      revenue: [
        { currency: "USD", amount: 120.5 },
        { currency: "EUR", amount: 20 },
      ],
      conversionRate: 10,
    });
  });

  it("an empty store is all zeros, and reports no activity", () => {
    const totals = toTotals({}, []);
    expect(totals).toEqual({ views: 0, adds: 0, purchases: 0, revenue: [], conversionRate: 0 });
    expect(hasActivity(totals)).toBe(false);
    expect(hasActivity(toTotals({ bundle_view: 1 }, []))).toBe(true);
  });
});

describe("formatting", () => {
  it("formats each currency as itself and joins several", () => {
    expect(formatRevenue([{ currency: "USD", amount: 1234.5 }])).toBe("$1,234.50");
    expect(
      formatRevenue([
        { currency: "USD", amount: 10 },
        { currency: "EUR", amount: 5 },
      ]),
    ).toBe("$10.00 · €5.00");
  });

  it("shows no figure rather than 0 when nothing was recorded or nothing could convert", () => {
    expect(formatRevenue([])).toBeNull();
    expect(formatConversion(0, 0)).toBeNull();
    expect(formatConversion(100, 10)).toBe("10%");
  });
});

describe("client event validation", () => {
  const valid = { bundleId: B1, event: "bundle_view", eventId: I1 };

  it("accepts bundle_view and bundle_add (with an instance id)", () => {
    expect(parseClientEvent(valid)).toEqual(valid);
    expect(parseClientEvent({ ...valid, event: "bundle_add", instanceId: I2 }).instanceId).toBe(I2);
  });

  it("rejects purchases, unknown events, bad ids, and any extra field a client might add", () => {
    const bad: unknown[] = [
      { ...valid, event: "bundle_purchase" },
      { ...valid, event: "other" },
      { ...valid, bundleId: "nope" },
      { ...valid, eventId: undefined },
      { ...valid, eventId: "x" },
      { ...valid, instanceId: "x" },
      { ...valid, shopId: "another-shop" },
      { ...valid, revenue: 100 },
      null,
      "bundle_view",
      [],
    ];
    for (const value of bad) {
      expect(() => parseClientEvent(value), JSON.stringify(value)).toThrow(ApiError);
    }
  });
});

describe("filter validation", () => {
  const parse = (query: string) => parseAnalyticsFilters(new URLSearchParams(query));
  const message = (query: string) => {
    try {
      parse(query);
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(400);
      return (error as ApiError).message;
    }
    throw new Error("expected a validation error");
  };

  it("no parameters means no filters", () => {
    expect(parse("")).toEqual({ from: null, to: null, bundleId: null });
  });

  it("reads bare dates as whole UTC days (inclusive)", () => {
    const filters = parse("startDate=2026-09-01&endDate=2026-09-30");
    expect(filters.from?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(filters.to?.toISOString()).toBe("2026-09-30T23:59:59.999Z");
  });

  it("accepts ISO timestamps, a single bound, and a same-day range", () => {
    expect(parse("startDate=2026-09-01T10:00:00Z").to).toBeNull();
    expect(parse("endDate=2026-09-01T10:00:00%2B02:00").to?.toISOString()).toBe(
      "2026-09-01T08:00:00.000Z",
    );
    expect(parse("startDate=2026-09-05&endDate=2026-09-05").from).not.toBeNull();
  });

  it("rejects invalid dates and reversed or absurd ranges", () => {
    expect(message("startDate=yesterday")).toMatch(/startDate/);
    expect(message("endDate=2026-02-31")).toMatch(/endDate/);
    expect(message("startDate=2026-09-30&endDate=2026-09-01")).toMatch(/must not be after/);
    expect(message("startDate=1970-01-01")).toMatch(/out of range/);
    expect(message("endDate=2999-01-01")).toMatch(/out of range/);
  });

  it("validates bundleId, and ignores a shopId parameter completely", () => {
    expect(parse(`bundleId=${B1}`).bundleId).toBe(B1);
    expect(message("bundleId=abc")).toMatch(/bundleId/);
    const filters = parse("shopId=another-shop");
    expect(filters).toEqual({ from: null, to: null, bundleId: null });
    expect(JSON.stringify(filters)).not.toContain("another-shop");
  });
});

interface LineOptions {
  bundle?: string | null;
  instance?: string | null;
  price?: string;
  currency?: string;
  quantity?: number;
  discounts?: string[];
  noPriceSet?: boolean;
}

const line = (o: LineOptions = {}) => ({
  quantity: o.quantity ?? 1,
  price_set: o.noPriceSet
    ? undefined
    : { shop_money: { amount: o.price ?? "50.00", currency_code: o.currency ?? "USD" } },
  discount_allocations: (o.discounts ?? []).map((amount) => ({
    amount_set: { shop_money: { amount, currency_code: o.currency ?? "USD" } },
  })),
  properties: [
    ...(o.bundle === null ? [] : [{ name: "_bundle_id", value: o.bundle ?? B1 }]),
    ...(o.instance === null ? [] : [{ name: "_bundle_instance_id", value: o.instance ?? I1 }]),
    { name: "Gift", value: "yes" },
  ],
});

const order = (lines: object[], id: unknown = 4501) => ({ id, line_items: lines });

describe("purchase extraction from a Shopify order", () => {
  it("revenue is line price x quantity minus discount allocations, from shop money", () => {
    const result = extractBundlePurchases(
      order([
        line({ price: "50.00", discounts: ["10.00"] }),
        line({ price: "25.00", quantity: 2 }),
      ]),
    );
    expect(result).toEqual({
      orderId: "gid://shopify/Order/4501",
      purchases: [{ bundleId: B1, instanceId: I1, revenue: 90, currency: "USD", units: 3 }],
    });
  });

  it("prefers the order's global id", () => {
    const result = extractBundlePurchases({
      ...order([line()]),
      admin_graphql_api_id: "gid://shopify/Order/999",
    });
    expect(result?.orderId).toBe("gid://shopify/Order/999");
  });

  it("makes one purchase per bundle instance, and skips unrelated lines", () => {
    const result = extractBundlePurchases(
      order([
        line({ instance: I1, price: "10.00" }),
        line({ instance: I2, price: "20.00" }),
        line({ bundle: B2, instance: I2, price: "5.00" }),
        line({ bundle: null, instance: null, price: "999.00" }),
      ]),
    );
    expect(result?.purchases).toHaveLength(3);
    expect(result?.purchases.map((p) => p.revenue).sort((a, b) => a - b)).toEqual([5, 10, 20]);
  });

  it("does not count a line without both properties, or with malformed ids", () => {
    const result = extractBundlePurchases(
      order([
        line({ instance: null }),
        line({ bundle: null }),
        line({ bundle: "not-a-uuid" }),
        line({ instance: "not-a-uuid" }),
      ]),
    );
    expect(result?.purchases).toEqual([]);
  });

  it("never invents revenue: missing or odd money drops the instance", () => {
    expect(extractBundlePurchases(order([line({ noPriceSet: true })]))?.purchases).toEqual([]);
    expect(extractBundlePurchases(order([line({ price: "abc" })]))?.purchases).toEqual([]);
    expect(extractBundlePurchases(order([line({ price: "-5.00" })]))?.purchases).toEqual([]);
    expect(
      extractBundlePurchases(order([line({ currency: "USD" }), line({ currency: "EUR" })]))
        ?.purchases,
    ).toEqual([]);
  });

  it("revenue is never negative", () => {
    const result = extractBundlePurchases(order([line({ price: "10.00", discounts: ["25.00"] })]));
    expect(result?.purchases[0].revenue).toBe(0);
  });

  it("is exact to the cent", () => {
    const result = extractBundlePurchases(
      order([line({ price: "19.99", quantity: 3, discounts: ["0.10", "0.20"] })]),
    );
    expect(result?.purchases[0].revenue).toBe(59.67);
  });

  it("returns null for something that isn't an order", () => {
    for (const value of [null, {}, "x", { line_items: "no" }, { id: "abc", line_items: [] }]) {
      expect(extractBundlePurchases(value)).toBeNull();
    }
  });

  it("carries no customer data through", () => {
    const result = extractBundlePurchases({
      ...order([line()]),
      email: "buyer@example.com",
      customer: { first_name: "A", last_name: "B" },
      shipping_address: { address1: "1 Main St" },
    });
    expect(JSON.stringify(result)).not.toMatch(/buyer|first_name|Main St/);
  });
});
