type Attributes = Record<string, string | number | boolean | undefined>;
export type Child = Node | string | null | undefined | false;

/**
 * Tiny element builder. Text children go through `append`, which inserts
 * them as text nodes — never parsed as HTML — so merchant-supplied names
 * and Shopify product titles can't inject markup.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children) {
    if (child) node.append(child);
  }
  return node;
}

/** Only https (or same-site relative) image URLs are ever put into `src`. */
export function safeImageUrl(url: string | null): string | null {
  if (!url) return null;
  return /^(https:\/\/|\/)/.test(url) ? url : null;
}

/**
 * Ask Shopify's CDN for a smaller rendition (`?width=`) so a card does not download a full
 * size product photo. Only cdn.shopify.com URLs are touched; anything else is returned as is.
 */
export function sizedImageUrl(url: string, width: number): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "cdn.shopify.com") return url;
    parsed.searchParams.set("width", String(width));
    return parsed.toString();
  } catch {
    return url;
  }
}

export function formatMoney(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
