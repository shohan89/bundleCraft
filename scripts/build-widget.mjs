// Builds the storefront widget (storefront/widget/**) into the theme extension's single
// JS asset. Shopify theme app extensions have no build step of their own, so the built
// file is committed; a test (storefront/widget/build.test.ts) fails if it drifts from
// the source. Run after changing anything under storefront/ or lib/storefront/.
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";

export const WIDGET_OUT = "extensions/bundle-widget/assets/bundlecraft-widget.js";
// Customer-facing JS budget (gzipped). Fail loudly instead of letting it creep.
export const MAX_GZIP_BYTES = 12 * 1024;

/** @type {import("esbuild").BuildOptions} */
export const buildOptions = {
  entryPoints: ["storefront/widget/index.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: ["es2019"],
  legalComments: "none",
  tsconfig: "tsconfig.json",
  outfile: WIDGET_OUT,
  logLevel: "warning",
};

async function main() {
  await build(buildOptions);
  const source = readFileSync(WIDGET_OUT);
  const gzip = gzipSync(source).length;
  console.log(`bundlecraft-widget.js: ${source.length} bytes (${gzip} gzipped)`);
  if (gzip > MAX_GZIP_BYTES) {
    console.error(`Widget exceeds the ${MAX_GZIP_BYTES} byte gzip budget.`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
