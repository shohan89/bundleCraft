import { validateBundleForPublish } from "@/lib/bundles/rules";
import type { BundleValidationResult } from "@/lib/bundles/types";
import { bundleNotFound } from "@/lib/bundles/errors";
import { prisma } from "@/lib/prisma";
import { bundleInclude, toDraftInput } from "./shared";

/** Read-only publish-readiness check against the bundle's current stored state. */
export async function validateBundle(
  shopId: string,
  bundleId: string,
): Promise<BundleValidationResult> {
  const row = await prisma.bundle.findFirst({
    where: { id: bundleId, shopId },
    include: bundleInclude,
    // One joined statement instead of one round trip per relation.
    relationLoadStrategy: "join",
  });
  if (!row) throw bundleNotFound();

  const errors = validateBundleForPublish(toDraftInput(row));
  return { valid: errors.length === 0, errors };
}
