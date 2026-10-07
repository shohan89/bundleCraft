/**
 * Production readiness checks for the environment and the Shopify app configuration. Pure
 * functions (no I/O, no Prisma, no network) so they can be unit tested and run from
 * scripts/check-production.ts before a deploy.
 *
 * A finding names the variable or setting and what is wrong. It NEVER contains a value: a secret
 * that is missing, weak or malformed must not end up in a terminal or a CI log.
 */
export interface Finding {
  level: "error" | "warn";
  code: string;
  message: string;
}

const error = (code: string, message: string): Finding => ({ level: "error", code, message });
const warn = (code: string, message: string): Finding => ({ level: "warn", code, message });

/** Hosts that only exist while a developer's machine is running. */
const DEV_HOST =
  /(^|\.)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$|(^|\.)(trycloudflare\.com|ngrok\.io|ngrok-free\.app|ngrok\.app|loca\.lt|localtunnel\.me|serveo\.net|tunnelmole\.net|loophole\.site)$/i;

export function isDevelopmentHost(host: string): boolean {
  return DEV_HOST.test(host.replace(/:\d+$/, ""));
}

/** A production origin: https, a real host, no path, query or credentials. Returns the origin or a finding. */
function checkOrigin(name: string, raw: string): { origin: string } | Finding {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return error("URL_INVALID", `${name} is not a valid URL.`);
  }
  if (url.protocol !== "https:") return error("URL_NOT_HTTPS", `${name} must use https.`);
  if (isDevelopmentHost(url.hostname)) {
    return error(
      "URL_DEVELOPMENT_HOST",
      `${name} points at a localhost or tunnel host; production needs the real domain.`,
    );
  }
  if (url.username || url.password) {
    return error("URL_CREDENTIALS", `${name} must not contain credentials.`);
  }
  if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    return error(
      "URL_NOT_ORIGIN",
      `${name} must be just the origin (scheme and host), with no path or query.`,
    );
  }
  return { origin: url.origin };
}

export const REQUIRED_ENV: readonly string[] = [
  "DATABASE_URL",
  "DIRECT_URL",
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SHOPIFY_APP_URL",
  "NEXT_PUBLIC_APP_URL",
  "SESSION_SECRET",
];

const PLACEHOLDER = /^(changeme|change-me|secret|password|test|example|xxx+|todo|your[-_ ].*)$/i;

/** Checks an environment (process.env shape). Production mode is the strict one. */
export function checkEnvironment(
  env: Record<string, string | undefined>,
  mode: "production" | "development" = "production",
): Finding[] {
  const findings: Finding[] = [];
  const value = (name: string) => (env[name] ?? "").trim();

  for (const name of REQUIRED_ENV) {
    if (value(name) === "") findings.push(error("ENV_MISSING", `${name} is not set.`));
  }

  for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
    const raw = value(name);
    if (raw === "") continue;
    if (!/^postgres(ql)?:\/\//i.test(raw)) {
      findings.push(
        error(
          "DB_URL_INVALID",
          `${name} must be a postgres:// or postgresql:// connection string.`,
        ),
      );
      continue;
    }
    try {
      const host = new URL(raw).hostname;
      if (mode === "production" && isDevelopmentHost(host)) {
        findings.push(error("DB_URL_LOCAL", `${name} points at a local database.`));
      }
    } catch {
      findings.push(error("DB_URL_INVALID", `${name} is not a parseable connection string.`));
    }
  }

  const origins: Record<string, string> = {};
  if (mode === "production") {
    for (const name of ["SHOPIFY_APP_URL", "NEXT_PUBLIC_APP_URL"]) {
      const raw = value(name);
      if (raw === "") continue;
      const checked = checkOrigin(name, raw);
      if ("origin" in checked) origins[name] = checked.origin;
      else findings.push(checked);
    }
  }
  if (
    origins.SHOPIFY_APP_URL &&
    origins.NEXT_PUBLIC_APP_URL &&
    origins.SHOPIFY_APP_URL !== origins.NEXT_PUBLIC_APP_URL
  ) {
    findings.push(
      error("URL_MISMATCH", "NEXT_PUBLIC_APP_URL and SHOPIFY_APP_URL must be the same origin."),
    );
  }

  const session = value("SESSION_SECRET");
  if (session !== "") {
    if (session.length < 32) {
      findings.push(
        error(
          "SESSION_SECRET_WEAK",
          "SESSION_SECRET must be at least 32 characters (use 32 random bytes, base64url).",
        ),
      );
    } else if (PLACEHOLDER.test(session)) {
      findings.push(
        error("SESSION_SECRET_PLACEHOLDER", "SESSION_SECRET looks like a placeholder."),
      );
    }
    if (session === value("SHOPIFY_API_SECRET")) {
      findings.push(error("SECRET_REUSED", "SESSION_SECRET must not equal SHOPIFY_API_SECRET."));
    }
  }

  const apiKey = value("SHOPIFY_API_KEY");
  if (apiKey !== "" && !/^[0-9a-f]{32}$/i.test(apiKey)) {
    findings.push(
      warn(
        "API_KEY_SHAPE",
        "SHOPIFY_API_KEY is not the usual 32 hex characters; check it is the client ID.",
      ),
    );
  }
  const apiSecret = value("SHOPIFY_API_SECRET");
  if (apiSecret !== "" && (apiSecret.length < 32 || PLACEHOLDER.test(apiSecret))) {
    findings.push(
      warn(
        "API_SECRET_SHAPE",
        "SHOPIFY_API_SECRET looks short or like a placeholder; check it is the client secret.",
      ),
    );
  }

  if (mode === "production") {
    if (value("SHOPIFY_BILLING_LIVE") !== "true") {
      findings.push(
        warn(
          "BILLING_TEST_MODE",
          'SHOPIFY_BILLING_LIVE is not exactly "true": charges are Shopify TEST charges (nothing is billed). Correct for development stores, wrong for real merchants.',
        ),
      );
    }
    if (value("RATE_LIMIT") === "off") {
      findings.push(
        error("RATE_LIMIT_OFF", "RATE_LIMIT=off disables rate limiting; remove it in production."),
      );
    }
    for (const name of ["STOREFRONT_SHOP_CACHE_MS", "TEMPLATE_CACHE_MS"]) {
      if (value(name) === "0") {
        findings.push(warn("CACHE_OFF", `${name}=0 disables that cache (meant for tests).`));
      }
    }
    if (env.NODE_ENV !== undefined && env.NODE_ENV !== "production") {
      findings.push(warn("NODE_ENV", 'NODE_ENV is not "production".'));
    }
  }
  return findings;
}

const stringOf = (toml: string, key: string): string | null =>
  new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m").exec(toml)?.[1] ?? null;
const listOf = (toml: string, key: string): string[] => {
  const raw = new RegExp(`^${key}\\s*=\\s*\\[([^\\]]*)\\]`, "m").exec(toml)?.[1] ?? "";
  return [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
};
const proxyField = (toml: string, key: string): string | null =>
  new RegExp(`\\[app_proxy\\][\\s\\S]*?^${key}\\s*=\\s*"([^"]*)"`, "m").exec(toml)?.[1] ?? null;

export const COMPLIANCE_TOPICS_REQUIRED = [
  "customers/data_request",
  "customers/redact",
  "shop/redact",
];

/**
 * Checks a shopify.app*.toml. `production: true` is the strict mode for the file that is deployed:
 * real https URLs, redirect and proxy URLs on the same origin, the scopes the code asks for.
 * The development file legitimately points at localhost (the CLI rewrites it under `shopify app dev`).
 */
export function checkAppToml(
  toml: string,
  options: { production: boolean; expectedScopes: readonly string[] },
): Finding[] {
  const findings: Finding[] = [];
  const clientId = stringOf(toml, "client_id");
  if (!clientId || !/^[0-9a-f]{32}$/i.test(clientId)) {
    findings.push(
      error("TOML_CLIENT_ID", "client_id is missing or is not a 32 character app client ID."),
    );
  }
  if (!/^embedded\s*=\s*true/m.test(toml)) {
    findings.push(
      error(
        "TOML_EMBEDDED",
        "embedded must be true (the dashboard runs inside the Shopify admin).",
      ),
    );
  }

  const scopes = (stringOf(toml, "scopes") ?? "").split(",").filter(Boolean);
  if ([...scopes].sort().join() !== [...options.expectedScopes].sort().join()) {
    findings.push(
      error(
        "TOML_SCOPES",
        "scopes do not match the scopes the app requests in code (services/shopify/oauth.ts).",
      ),
    );
  }

  const applicationUrl = stringOf(toml, "application_url");
  const redirects = listOf(toml, "redirect_urls");
  const proxyUrl = proxyField(toml, "url");
  const subpath = proxyField(toml, "subpath");
  const prefix = proxyField(toml, "prefix");

  if (!applicationUrl) findings.push(error("TOML_APP_URL", "application_url is missing."));
  if (redirects.length === 0) findings.push(error("TOML_REDIRECT", "auth.redirect_urls is empty."));
  if (!proxyUrl) findings.push(error("TOML_PROXY", "[app_proxy] url is missing."));

  if (applicationUrl) {
    const base = applicationUrl.replace(/\/$/, "");
    for (const redirect of redirects) {
      if (!redirect.startsWith(`${base}/`) || !redirect.endsWith("/api/auth/callback")) {
        findings.push(
          error(
            "TOML_REDIRECT_MISMATCH",
            "each redirect URL must be application_url + /api/auth/callback.",
          ),
        );
      }
    }
    if (proxyUrl && proxyUrl !== `${base}/api/storefront`) {
      findings.push(
        error("TOML_PROXY_MISMATCH", "[app_proxy] url must be application_url + /api/storefront."),
      );
    }
  }
  if (subpath !== "bundlecraft" || prefix !== "apps") {
    findings.push(
      error(
        "TOML_PROXY_PATH",
        '[app_proxy] must serve /apps/bundlecraft (prefix "apps", subpath "bundlecraft"): the storefront widget calls that path.',
      ),
    );
  }

  const declared = [...toml.matchAll(/compliance_topics\s*=\s*\[([^\]]*)\]/g)].flatMap((m) =>
    [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
  );
  for (const topic of COMPLIANCE_TOPICS_REQUIRED) {
    if (!declared.includes(topic)) {
      findings.push(
        error(
          "TOML_COMPLIANCE",
          `mandatory privacy webhook ${topic} is not declared (compliance_topics).`,
        ),
      );
    }
  }

  if (options.production) {
    const urls: [string, string | null][] = [
      ["application_url", applicationUrl],
      ["[app_proxy] url", proxyUrl],
      ...redirects.map((r): [string, string] => ["auth.redirect_urls", r]),
    ];
    for (const [name, raw] of urls) {
      if (!raw) continue;
      let url: URL | null = null;
      try {
        url = new URL(raw);
      } catch {
        findings.push(error("TOML_URL_INVALID", `${name} is not a valid URL.`));
      }
      if (url && url.protocol !== "https:") {
        findings.push(error("TOML_URL_NOT_HTTPS", `${name} must use https.`));
      }
      if (url && isDevelopmentHost(url.hostname)) {
        findings.push(
          error("TOML_URL_DEVELOPMENT_HOST", `${name} points at localhost or a tunnel.`),
        );
      }
    }
    if (/^automatically_update_urls_on_dev\s*=\s*true/m.test(toml)) {
      findings.push(
        warn(
          "TOML_DEV_URL_REWRITE",
          "automatically_update_urls_on_dev is a development setting; leave it out of the production file.",
        ),
      );
    }
  }
  return findings;
}

export const hasErrors = (findings: Finding[]): boolean =>
  findings.some((finding) => finding.level === "error");
