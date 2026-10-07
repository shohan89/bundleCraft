import { validationFailed } from "@/lib/bundles/errors";
import type { BundleDraftInput, BundleDto } from "@/lib/bundles/types";
import { prisma } from "@/lib/prisma";
import { customizationToRow } from "@/services/customization/mapping";
import { assertTemplateSelectable } from "@/services/templates/templates";
import { checkCatalogProducts } from "@/services/products/validate";
import {
  assertValidDraft,
  bundleInclude,
  insertProducts,
  mapPersistenceError,
  toBundleDto,
} from "./shared";

/**
 * Creates a DRAFT bundle for `shopId` (taken from the authenticated
 * session by the caller — never from request input). The bundle, its
 * products, and its customization are written in one transaction: either
 * all of it exists afterward or none of it does.
 */
export async function createBundle(
  shopId: string,
  input: BundleDraftInput,
  options: { verifyCatalog?: boolean; verifyTemplate?: boolean } = {},
): Promise<BundleDto> {
  const draft = assertValidDraft(input);
  // Merchant-facing calls (the API) pass verifyCatalog: every product and variant must exist in
  // THIS shop's synced catalog, so ids from another shop or made-up ids are refused.
  if (options.verifyCatalog) {
    const issues = await checkCatalogProducts(shopId, draft.products, { requireBuyable: false });
    if (issues.length > 0) throw validationFailed(issues);
  }

  // Merchant-facing calls also pass verifyTemplate: the chosen template must exist and still be
  // offered. Internal copies (duplicate) skip it so a retired template never blocks a copy.
  if (options.verifyTemplate && draft.templateId) await assertTemplateSelectable(draft.templateId);

  try {
    const row = await prisma.$transaction(async (tx) => {
      const bundle = await tx.bundle.create({
        data: {
          shopId,
          title: draft.title,
          description: draft.description,
          bundleType: draft.bundleType,
          templateId: draft.templateId,
          requiredQuantity: draft.requiredQuantity,
          discountType: draft.discountType,
          discountValue: draft.discountValue,
          status: "draft",
        },
      });

      await insertProducts(tx, bundle.id, draft.products);

      if (draft.customization) {
        await tx.customization.create({
          data: { bundleId: bundle.id, ...customizationToRow(draft.customization) },
        });
      }

      return tx.bundle.findUniqueOrThrow({
        where: { id: bundle.id },
        include: bundleInclude,
        relationLoadStrategy: "join",
      });
    });
    return toBundleDto(row);
  } catch (error) {
    throw mapPersistenceError(error);
  }
}
