import { toNumericId } from "./config";

/** A cart line reduced to what bundle detection needs. */
export interface BundleLine {
  id: string;
  quantity: number;
  productId: string;
  variantId: string;
  subtotalCents: number;
}

export interface BundleInstance {
  instanceId: string;
  lines: BundleLine[];
}

/** Minimal structural view of the generated CartInput line. */
export interface InputLine {
  id: string;
  quantity: number;
  bundleId?: { value?: string | null } | null;
  instanceId?: { value?: string | null } | null;
  cost: { subtotalAmount: { amount: string | number } };
  merchandise:
    | { __typename: "ProductVariant"; id: string; product: { id: string } }
    | { __typename: string };
}

export const toCents = (amount: string | number): number => Math.round(Number(amount) * 100);

/**
 * Finds the bundle instances that *claim* to belong to `bundleId`: lines
 * sharing a `_bundle_instance_id`. A claim is not trusted — validation.ts
 * checks the group against the merchant's configuration. A group is dropped
 * outright if any of its lines claims a different bundle (a tampered or
 * mixed group can never be a complete instance of this one), and lines
 * without an instance id are never grouped, so they can't be discounted.
 */
export function groupBundleInstances(lines: InputLine[], bundleId: string): BundleInstance[] {
  const groups = new Map<string, { lines: BundleLine[]; foreign: boolean }>();

  for (const line of lines) {
    const instanceId = line.instanceId?.value;
    const claimedBundle = line.bundleId?.value;
    if (!instanceId || !claimedBundle) continue;

    const group = groups.get(instanceId) ?? { lines: [], foreign: false };
    groups.set(instanceId, group);

    if (claimedBundle !== bundleId) {
      group.foreign = true;
      continue;
    }
    if (line.merchandise.__typename !== "ProductVariant" || !("product" in line.merchandise)) {
      group.foreign = true; // custom products can never be part of a bundle
      continue;
    }
    group.lines.push({
      id: line.id,
      quantity: line.quantity,
      productId: toNumericId(line.merchandise.product.id),
      variantId: toNumericId(line.merchandise.id),
      subtotalCents: toCents(line.cost.subtotalAmount.amount),
    });
  }

  return [...groups.entries()]
    .filter(([, group]) => !group.foreign && group.lines.length > 0)
    .map(([instanceId, group]) => ({ instanceId, lines: group.lines }));
}
