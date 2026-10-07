/**
 * Turns a Shopify order (the `orders/paid` webhook payload) into bundle
 * purchases. Pure: no database, no network.
 *
 * Revenue comes only from the order's own line-item money in the SHOP
 * currency (`shop_money`), net of discount allocations — the bundle
 * discount included — never from prices the storefront reported. One
 * purchase is produced per bundle instance: the cart lines the widget added
 * together share `_bundle_id` and `_bundle_instance_id`. Tax, shipping and
 * tips are not attributed to a bundle.
 *
 * What this cannot prove: the properties are written by the storefront, so
 * a shopper who edits them can mis-attribute their own order to a bundle of
 * the same shop. The revenue counted is still the real order's; it can never
 * reach another shop (the caller only accepts bundles of the webhook's shop).
 */
import { z } from "zod";

const money = z.object({ amount: z.string(), currency_code: z.string() }).loose();

const orderSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    admin_graphql_api_id: z.string().optional(),
    line_items: z
      .array(
        z
          .object({
            quantity: z.number().int().min(0),
            price_set: z.object({ shop_money: money }).loose().optional(),
            discount_allocations: z
              .array(
                z
                  .object({ amount_set: z.object({ shop_money: money }).loose().optional() })
                  .loose(),
              )
              .optional(),
            properties: z
              .array(z.object({ name: z.string(), value: z.unknown() }).loose())
              .optional(),
          })
          .loose(),
      )
      .max(500),
  })
  .loose();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;
const AMOUNT = /^\d{1,10}(\.\d{1,4})?$/;

export interface BundlePurchase {
  bundleId: string;
  instanceId: string;
  /** Net line revenue in `currency`, to the cent. */
  revenue: number;
  currency: string;
  units: number;
}

export interface OrderPurchases {
  /** gid://shopify/Order/... */
  orderId: string;
  purchases: BundlePurchase[];
}

const toCents = (amount: string): number | null =>
  AMOUNT.test(amount) ? Math.round(Number(amount) * 100) : null;

function propertyValue(
  properties: { name: string; value?: unknown }[] | undefined,
  name: string,
): string | null {
  const found = properties?.find((property) => property.name === name);
  return typeof found?.value === "string" ? found.value : null;
}

/** Returns null when the payload isn't an order we can identify. */
export function extractBundlePurchases(payload: unknown): OrderPurchases | null {
  const parsed = orderSchema.safeParse(payload);
  if (!parsed.success) return null;
  const order = parsed.data;

  const orderId =
    order.admin_graphql_api_id ??
    (order.id !== undefined ? `gid://shopify/Order/${order.id}` : null);
  if (!orderId || !/^gid:\/\/shopify\/Order\/\d{1,20}$/.test(orderId)) return null;

  const instances = new Map<string, BundlePurchase & { cents: number; broken: boolean }>();

  for (const line of order.line_items) {
    const bundleId = propertyValue(line.properties, "_bundle_id");
    const instanceId = propertyValue(line.properties, "_bundle_instance_id");
    if (!bundleId || !instanceId || !UUID.test(bundleId) || !UUID.test(instanceId)) continue;

    const key = `${bundleId}:${instanceId}`;
    const entry = instances.get(key) ?? {
      bundleId: bundleId.toLowerCase(),
      instanceId: instanceId.toLowerCase(),
      revenue: 0,
      currency: "",
      units: 0,
      cents: 0,
      broken: false,
    };
    instances.set(key, entry);

    const price = line.price_set?.shop_money;
    const unit = price ? toCents(price.amount) : null;
    if (!price || unit === null || !CURRENCY.test(price.currency_code)) {
      entry.broken = true; // no trustworthy figure: better no revenue than a guess
      continue;
    }
    if (entry.currency && entry.currency !== price.currency_code) {
      entry.broken = true;
      continue;
    }
    entry.currency = price.currency_code;

    let discount = 0;
    for (const allocation of line.discount_allocations ?? []) {
      const shopMoney = allocation.amount_set?.shop_money;
      const cents = shopMoney ? toCents(shopMoney.amount) : null;
      if (cents === null) {
        entry.broken = true;
        continue;
      }
      discount += cents;
    }

    entry.cents += Math.max(0, unit * line.quantity - discount);
    entry.units += line.quantity;
  }

  const purchases = [...instances.values()]
    .filter((entry) => !entry.broken && entry.currency !== "" && entry.units > 0)
    .map(({ bundleId, instanceId, currency, units, cents }) => ({
      bundleId,
      instanceId,
      currency,
      units,
      revenue: cents / 100,
    }));

  return { orderId, purchases };
}
