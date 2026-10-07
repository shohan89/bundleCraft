import { ApiError } from "@/lib/api/errors";
import { invalidTemplate, validationFailed } from "@/lib/bundles/errors";
import { normalizeDraft, validateBundleDraft } from "@/lib/bundles/rules";
import type {
  BundleDraftInput,
  BundleDraftPatch,
  BundleDto,
  BundleProductInput,
} from "@/lib/bundles/types";
import { Prisma } from "@/lib/generated/prisma/client";
import { customizationFromRow } from "@/services/customization/mapping";

export const bundleInclude = {
  bundleProducts: { orderBy: { position: "asc" } },
  customization: true,
} satisfies Prisma.BundleInclude;

export type BundleRow = Prisma.BundleGetPayload<{ include: typeof bundleInclude }>;

/** Internal row -> API/dashboard shape. Never includes shopId. */
export function toBundleDto(row: BundleRow): BundleDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    bundleType: row.bundleType,
    status: row.status,
    templateId: row.templateId,
    requiredQuantity: row.requiredQuantity,
    discountType: row.discountType,
    discountValue: row.discountValue.toNumber(),
    products: row.bundleProducts.map((product) => ({
      id: product.id,
      shopifyProductId: product.shopifyProductId,
      shopifyVariantId: product.shopifyVariantId,
      quantity: product.quantity,
      position: product.position,
    })),
    customization: row.customization ? customizationFromRow(row.customization) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The persisted state in the shape the rules validate. */
export function toDraftInput(row: BundleRow): BundleDraftInput {
  const dto = toBundleDto(row);
  return {
    title: dto.title,
    description: dto.description,
    bundleType: dto.bundleType,
    templateId: dto.templateId,
    requiredQuantity: dto.requiredQuantity,
    discountType: dto.discountType,
    discountValue: dto.discountValue,
    products: dto.products.map(({ shopifyProductId, shopifyVariantId, quantity }) => ({
      shopifyProductId,
      shopifyVariantId,
      quantity,
    })),
    customization: dto.customization,
  };
}

function pick<T>(patched: T | undefined, current: T): T {
  return patched === undefined ? current : patched;
}

/** Applies a partial update on top of the persisted state. Absent keys are left alone. */
export function applyPatch(current: BundleDraftInput, patch: BundleDraftPatch): BundleDraftInput {
  const bundleType = pick(patch.bundleType, current.bundleType);
  return {
    title: pick(patch.title, current.title),
    description: pick(patch.description, current.description),
    bundleType,
    templateId: pick(patch.templateId, current.templateId),
    // Switching to a fixed bundle drops a now-meaningless required quantity
    // unless the caller explicitly sent one (which validation then rejects).
    requiredQuantity:
      bundleType === "fixed" && patch.requiredQuantity === undefined
        ? null
        : pick(patch.requiredQuantity, current.requiredQuantity),
    discountType: pick(patch.discountType, current.discountType),
    discountValue: pick(patch.discountValue, current.discountValue),
    products: pick(patch.products, current.products),
    customization: pick(patch.customization, current.customization),
  };
}

/** Writes a bundle's product rows in array order (position = index). */
export async function insertProducts(
  tx: Prisma.TransactionClient,
  bundleId: string,
  products: BundleProductInput[],
): Promise<void> {
  if (products.length === 0) return;
  await tx.bundleProduct.createMany({
    data: products.map((product, position) => ({
      bundleId,
      shopifyProductId: product.shopifyProductId,
      shopifyVariantId: product.shopifyVariantId,
      quantity: product.quantity,
      position,
    })),
  });
}

/** Normalizes then validates draft rules; throws a 422 with structured issues. */
export function assertValidDraft(input: BundleDraftInput): BundleDraftInput {
  const normalized = normalizeDraft(input);
  const issues = validateBundleDraft(normalized);
  if (issues.length > 0) throw validationFailed(issues);
  return normalized;
}

/** Turns known database failures into safe API errors; everything else stays unexpected (500). */
export function mapPersistenceError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    return invalidTemplate();
  }
  return error;
}
