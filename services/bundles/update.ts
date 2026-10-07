import {
  bundleNotFound,
  concurrentModification,
  notEditable,
  validationFailed,
} from "@/lib/bundles/errors";
import { canEdit } from "@/lib/bundles/rules";
import type { BundleDraftPatch, BundleDto } from "@/lib/bundles/types";
import { prisma } from "@/lib/prisma";
import { customizationToRow } from "@/services/customization/mapping";
import { checkCatalogProducts } from "@/services/products/validate";
import { assertTemplateSelectable } from "@/services/templates/templates";
import {
  applyPatch,
  assertValidDraft,
  bundleInclude,
  insertProducts,
  mapPersistenceError,
  toBundleDto,
  toDraftInput,
} from "./shared";

/**
 * Partial update of a draft/inactive bundle owned by `shopId`. The merged
 * result (persisted state + patch) is validated as a whole, and products,
 * bundle row, and customization change in a single transaction — a
 * failure anywhere rolls the previous state back untouched.
 *
 * `status` can't be changed here; only publish/deactivate move it.
 */
export async function updateBundle(
  shopId: string,
  bundleId: string,
  patch: BundleDraftPatch,
  options: { verifyCatalog?: boolean; verifyTemplate?: boolean } = {},
): Promise<BundleDto> {
  if (options.verifyCatalog && patch.products !== undefined) {
    const issues = await checkCatalogProducts(shopId, patch.products, { requireBuyable: false });
    if (issues.length > 0) throw validationFailed(issues);
  }
  try {
    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.bundle.findFirst({
        where: { id: bundleId, shopId },
        include: bundleInclude,
        // One joined statement instead of one round trip per relation.
        relationLoadStrategy: "join",
      });
      if (!existing) throw bundleNotFound();
      if (!canEdit(existing.status)) throw notEditable();

      const draft = assertValidDraft(applyPatch(toDraftInput(existing), patch));

      // Keeping the template the bundle already has is always allowed (it may have been retired
      // since); only choosing a different one needs it to be available.
      if (options.verifyTemplate && draft.templateId && draft.templateId !== existing.templateId) {
        await assertTemplateSelectable(draft.templateId);
      }

      if (patch.products !== undefined) {
        await tx.bundleProduct.deleteMany({ where: { bundleId } });
        await insertProducts(tx, bundleId, draft.products);
      }

      // The status guard makes this a compare-and-set: if the bundle was
      // published by a concurrent request after we read it, nothing is
      // written and the whole transaction (including the product swap
      // above) is rolled back.
      const { count } = await tx.bundle.updateMany({
        where: { id: bundleId, shopId, status: { in: ["draft", "inactive"] } },
        data: {
          title: draft.title,
          description: draft.description,
          bundleType: draft.bundleType,
          templateId: draft.templateId,
          requiredQuantity: draft.requiredQuantity,
          discountType: draft.discountType,
          discountValue: draft.discountValue,
        },
      });
      if (count === 0) throw concurrentModification();

      if (patch.customization !== undefined) {
        if (draft.customization === null) {
          await tx.customization.deleteMany({ where: { bundleId } });
        } else {
          await tx.customization.upsert({
            where: { bundleId },
            create: { bundleId, ...customizationToRow(draft.customization) },
            update: customizationToRow(draft.customization),
          });
        }
      }

      return tx.bundle.findUniqueOrThrow({
        where: { id: bundleId },
        include: bundleInclude,
        relationLoadStrategy: "join",
      });
    });
    return toBundleDto(row);
  } catch (error) {
    throw mapPersistenceError(error);
  }
}
