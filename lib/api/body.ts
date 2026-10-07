import { ApiError } from "./errors";

/** Merchant and storefront JSON bodies are small; a bundle with 50 products is a few KB. */
export const MAX_JSON_BODY_BYTES = 256 * 1024;
/** Shopify webhook bodies (an order with many lines) can be larger, but are still bounded. */
export const MAX_WEBHOOK_BODY_BYTES = 2 * 1024 * 1024;

const tooLarge = () => new ApiError("PAYLOAD_TOO_LARGE", "Request body is too large.", 413);

/**
 * Reads a request body as text, refusing anything over `maxBytes`. The
 * declared Content-Length is checked first, and the stream itself is
 * counted as it arrives, so a client that lies about (or omits) the length
 * still cannot make the server buffer an unbounded body.
 */
export async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
