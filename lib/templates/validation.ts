import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { TEMPLATE_CATEGORIES } from "./types";

const querySchema = z.object({ category: z.enum(TEMPLATE_CATEGORIES).optional() }).strict();

/**
 * Query string of GET /api/templates. Only `category` is accepted: anything else (a shopId,
 * a status filter to reach inactive templates) is refused. An empty value counts as not given.
 */
export function parseTemplateQuery(params: URLSearchParams) {
  const raw: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (key in raw) throw new ApiError("INVALID_REQUEST", "Invalid template filters.", 400); // repeated parameter
    if (value !== "") raw[key] = value;
  }
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) throw new ApiError("INVALID_REQUEST", "Invalid template filters.", 400);
  return parsed.data;
}

const idSchema = z.uuid();
export function parseTemplateId(raw: string): string {
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError("INVALID_REQUEST", "Invalid template id.", 400);
  return parsed.data;
}
