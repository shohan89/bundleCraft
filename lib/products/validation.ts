import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { PRODUCT_LIST_STATUSES } from "./types";

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

const text = z.string().trim().max(100);
const querySchema = z
  .object({
    search: text.optional(),
    status: z.enum(PRODUCT_LIST_STATUSES).optional(),
    productType: text.optional(),
    vendor: text.optional(),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .strict();

export type ProductQuery = z.infer<typeof querySchema>;

/**
 * Query string of GET /api/products. Unknown parameters (including any `shopId`) are
 * rejected, limits are capped, and an empty value counts as "not given".
 */
export function parseProductQuery(params: URLSearchParams): ProductQuery {
  const raw: Record<string, string> = {};
  for (const [key, value] of params.entries()) if (value !== "") raw[key] = value;
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) throw new ApiError("INVALID_REQUEST", "Invalid product filters.", 400);
  return parsed.data;
}

const idSchema = z.uuid();
export function parseProductId(raw: string): string {
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError("INVALID_REQUEST", "Invalid product id.", 400);
  return parsed.data;
}
