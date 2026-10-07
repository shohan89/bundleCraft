import { bundleNotFound, notEditable, validationFailed } from "@/lib/bundles/errors";
import { canEdit } from "@/lib/bundles/rules";
import { cloneDefaultCustomization } from "@/lib/customization/defaults";
import type { BundleCustomization } from "@/lib/customization/types";
import { parseCustomization } from "@/lib/customization/validation";
import { prisma } from "@/lib/prisma";
import { customizationFromRow, customizationToRow } from "./mapping";

// Interactive transactions default to a 2 s wait and 5 s limit; a remote database under load
// can exceed that without anything being wrong, so allow more headroom.
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

/**
 * A bundle's customization for the merchant editor. Every query is scoped by the shop from the
 * session, so another shop's bundle is a plain 404. A bundle that was never customized reports
 * the defaults (nothing is written by reading).
 */
export async function getBundleCustomization(
  shopId: string,
  bundleId: string,
): Promise<BundleCustomization> {
  const bundle = await prisma.bundle.findFirst({
    where: { id: bundleId, shopId },
    select: { customization: true },
  });
  if (!bundle) throw bundleNotFound();
  return bundle.customization
    ? customizationFromRow(bundle.customization)
    : cloneDefaultCustomization();
}

/**
 * Saves a customization. `mode`:
 * - "merge" (PATCH): fields that are sent replace the stored ones, the rest stay as they are.
 * - "replace" (PUT): the body is the whole customization, missing fields use the defaults; an
 *   empty body therefore resets the bundle to the defaults.
 *
 * The input is parsed strictly (unknown fields, non-#RRGGBB colours and options outside the
 * lists are refused as a whole, nothing is half saved). Like the rest of a bundle, an active
 * bundle can't be changed: deactivate it first.
 */
export async function saveBundleCustomization(
  shopId: string,
  bundleId: string,
  input: unknown,
  mode: "merge" | "replace",
): Promise<BundleCustomization> {
  return prisma.$transaction(async (tx) => {
    const bundle = await tx.bundle.findFirst({
      where: { id: bundleId, shopId },
      select: { status: true, customization: true },
    });
    if (!bundle) throw bundleNotFound();
    if (!canEdit(bundle.status)) throw notEditable();

    const base =
      mode === "merge" && bundle.customization
        ? customizationFromRow(bundle.customization)
        : cloneDefaultCustomization();
    const parsed = parseCustomization(input, base);
    if (!parsed.ok) throw validationFailed(parsed.issues);

    const data = customizationToRow(parsed.value);
    await tx.customization.upsert({
      where: { bundleId },
      create: { bundleId, ...data },
      update: data,
    });
    return parsed.value;
  }, TRANSACTION_OPTIONS);
}
