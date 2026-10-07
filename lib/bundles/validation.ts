/**
 * Request-shape validation (Zod). This layer only answers "is this the
 * right shape and type?". Every business rule — ranges, bundle-type
 * consistency, publish readiness — lives once in ./rules.ts, so nothing is
 * validated in two places.
 */
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import type { BundleCustomization } from "@/lib/customization/types";
import { parseCustomization } from "@/lib/customization/validation";
import { validationFailed } from "./errors";
import {
  BUNDLE_TYPES,
  DISCOUNT_TYPES,
  type BundleDraftInput,
  type BundleDraftPatch,
  type ValidationIssue,
} from "./types";

const productShape = z
  .object({
    shopifyProductId: z.string(),
    shopifyVariantId: z.string(),
    quantity: z.number(),
  })
  .strict();

// `status` is intentionally absent and the objects are strict: a client
// sending { status: "active" } is rejected instead of silently ignored,
// so publishing can only happen through the validated publish operation.
const bundleShape = {
  title: z.string(),
  description: z.string().nullable().optional(),
  bundleType: z.enum(BUNDLE_TYPES),
  templateId: z.uuid().nullable().optional(),
  requiredQuantity: z.number().nullable().optional(),
  discountType: z.enum(DISCOUNT_TYPES),
  discountValue: z.number(),
  products: z.array(productShape).optional(),
  // Strict, partial: missing fields take the defaults, a bad or unknown one is rejected.
  customization: z.unknown().optional(),
};

const createSchema = z.object(bundleShape).strict();
const updateSchema = z.object(bundleShape).partial().strict();

export const bundleIdSchema = z.uuid();

const CODE_BY_FIELD: Record<string, string> = {
  bundleType: "INVALID_BUNDLE_TYPE",
  discountType: "INVALID_DISCOUNT",
  discountValue: "INVALID_DISCOUNT",
  requiredQuantity: "INVALID_QUANTITY",
  products: "INVALID_PRODUCT",
  customization: "INVALID_CUSTOMIZATION",
  templateId: "INVALID_TEMPLATE",
};

function toIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => {
    if (issue.code === "unrecognized_keys") {
      const keys = issue.keys.join(", ");
      return {
        field: keys,
        code: "UNKNOWN_FIELD",
        message: issue.keys.includes("status")
          ? "Bundle status can't be set directly. Use the publish and deactivate actions."
          : `Unknown field: ${keys}.`,
      };
    }
    const field = issue.path.join(".") || "body";
    return {
      field,
      code: CODE_BY_FIELD[String(issue.path[0])] ?? "INVALID_VALUE",
      message: issue.message,
    };
  });
}

/**
 * Customization arrives as `unknown` and is parsed by lib/customization (strict: unknown fields,
 * bad colours and out-of-list options fail the request). Missing fields take the defaults.
 */
function parseCustomizationField(raw: unknown): BundleCustomization | null {
  if (raw === null) return null;
  const parsed = parseCustomization(raw);
  if (!parsed.ok) throw validationFailed(parsed.issues);
  return parsed.value;
}

export function parseCreateBundleBody(body: unknown): BundleDraftInput {
  const result = createSchema.safeParse(body);
  if (!result.success) throw validationFailed(toIssues(result.error));
  const data = result.data;
  return {
    title: data.title,
    description: data.description ?? null,
    bundleType: data.bundleType,
    templateId: data.templateId ?? null,
    requiredQuantity: data.requiredQuantity ?? null,
    discountType: data.discountType,
    discountValue: data.discountValue,
    products: data.products ?? [],
    customization:
      data.customization === undefined ? null : parseCustomizationField(data.customization),
  };
}

export function parseUpdateBundleBody(body: unknown): BundleDraftPatch {
  const result = updateSchema.safeParse(body);
  if (!result.success) throw validationFailed(toIssues(result.error));

  // Copy only keys the client actually sent, so absent === "leave unchanged".
  const patch: BundleDraftPatch = {};
  const data = result.data;
  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description;
  if (data.bundleType !== undefined) patch.bundleType = data.bundleType;
  if (data.templateId !== undefined) patch.templateId = data.templateId;
  if (data.requiredQuantity !== undefined) patch.requiredQuantity = data.requiredQuantity;
  if (data.discountType !== undefined) patch.discountType = data.discountType;
  if (data.discountValue !== undefined) patch.discountValue = data.discountValue;
  if (data.products !== undefined) patch.products = data.products;
  // A bundle's customization is replaced as a whole; fields the client left out use the
  // defaults. (The customization endpoint is the one that merges onto the stored values.)
  if (data.customization !== undefined) {
    patch.customization = parseCustomizationField(data.customization);
  }
  return patch;
}

export const BUNDLE_LIST_DEFAULT_LIMIT = 50;
export const BUNDLE_LIST_MAX_LIMIT = 100;

const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(BUNDLE_LIST_MAX_LIMIT)
      .default(BUNDLE_LIST_DEFAULT_LIMIT),
  })
  .strict();

/** Query string of GET /api/bundles: only `page` and `limit`; anything else (a shopId) is refused. */
export function parseBundleListQuery(params: URLSearchParams): { page: number; limit: number } {
  const raw: Record<string, string> = {};
  for (const [key, value] of params.entries()) if (value !== "") raw[key] = value;
  const parsed = listQuerySchema.safeParse(raw);
  if (!parsed.success) throw new ApiError("INVALID_REQUEST", "Invalid list parameters.", 400);
  return parsed.data;
}
