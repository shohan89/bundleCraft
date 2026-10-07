/**
 * JSON for embedding inside an inline <script>. `<` is escaped so no value
 * (the OAuth start URL's query string is attacker-controlled) can ever close
 * the script tag or open an HTML comment, whatever the URL parser does; the
 * U+2028/U+2029 separators are escaped for older JavaScript engines.
 */
export function scriptSafeJson(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
