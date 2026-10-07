/**
 * Shape validation for public storefront input. Everything a customer's
 * browser can send is untrusted, so each field is checked strictly and
 * unknown keys are rejected. Business rules (selection counts, variants)
 * live in ./selection.ts.
 */
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";

const numericId = z.string().regex(/^\d{1,20}$/);

const querySchema = z
  .object({
    bundleId: z.uuid().optional(),
    productId: numericId.optional(),
    view: z.literal("listing").optional(),
  })
  .strict();

const cartRequestSchema = z
  .object({
    bundleId: z.uuid(),
    selection: z
      .array(z.object({ key: numericId, variantId: numericId, quantity: z.number() }).strict())
      .max(60),
  })
  .strict();

const invalid = () => new ApiError("INVALID_REQUEST", "Invalid request.", 400);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw invalid();
  return result.data;
}

export function parseStorefrontQuery(params: URLSearchParams) {
  // Only our own params are read; Shopify's proxy params (shop, signature,
  // timestamp, path_prefix, ...) are handled by the signature check.
  const candidate: Record<string, string> = {};
  const bundleId = params.get("bundleId");
  const productId = params.get("productId");
  if (bundleId !== null) candidate.bundleId = bundleId;
  const view = params.get("view");
  if (productId !== null) candidate.productId = productId;
  if (view !== null) candidate.view = view;
  const query = parse(querySchema, candidate);
  // A card list is a different question from one bundle or the bundles of one product.
  if (query.view && (query.bundleId || query.productId)) throw invalid();
  return query;
}

export const parseCartRequest = (body: unknown) => parse(cartRequestSchema, body);
