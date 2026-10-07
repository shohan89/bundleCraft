/**
 * Pre-deploy check: `npm run check:production [-- --toml shopify.app.production.toml] [--dev]`.
 * Verifies the environment variables and the Shopify app configuration for a production deploy
 * (see docs/15-PRODUCTION_DEPLOYMENT.md). Prints variable and setting NAMES only, never values.
 * Exits 1 when anything is an error. Reads process.env (load a file with your shell or CI).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { SHOPIFY_SCOPES } from "../services/shopify/oauth";
import { checkAppToml, checkEnvironment, hasErrors, type Finding } from "../lib/deploy/readiness";

const args = process.argv.slice(2);
const dev = args.includes("--dev");
const tomlIndex = args.indexOf("--toml");
const tomlPath =
  tomlIndex >= 0 ? args[tomlIndex + 1] : dev ? "shopify.app.toml" : "shopify.app.production.toml";

const findings: Finding[] = checkEnvironment(process.env, dev ? "development" : "production");
try {
  findings.push(
    ...checkAppToml(readFileSync(tomlPath, "utf8"), {
      production: !dev,
      expectedScopes: SHOPIFY_SCOPES,
    }),
  );
} catch {
  findings.push({
    level: "error",
    code: "TOML_UNREADABLE",
    message: `Cannot read ${tomlPath}. Create it from shopify.app.production.toml.example.`,
  });
}

for (const finding of findings) {
  console.log(
    `${finding.level === "error" ? "ERROR" : "warn "} [${finding.code}] ${finding.message}`,
  );
}
const errors = findings.filter((f) => f.level === "error").length;
console.log(
  hasErrors(findings)
    ? `\nNot ready: ${errors} error(s).`
    : `\nNo errors (${findings.length} warning(s)) for ${dev ? "development" : "production"} using ${tomlPath}.`,
);
process.exit(hasErrors(findings) ? 1 : 0);
