// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SHOPIFY_SCOPES } from "@/services/shopify/oauth";
import { readFileSync } from "node:fs";
import {
  checkAppToml,
  checkEnvironment,
  hasErrors,
  isDevelopmentHost,
  REQUIRED_ENV,
} from "./readiness";

const good = {
  DATABASE_URL: "postgresql://app:s3cr3t@db.example.com:6543/postgres?pgbouncer=true",
  DIRECT_URL: "postgresql://app:s3cr3t@db.example.com:5432/postgres",
  SHOPIFY_API_KEY: "a0aa30cd251a62b6dcacbfa52cf5bc10",
  SHOPIFY_API_SECRET: "0123456789abcdef0123456789abcdef",
  SHOPIFY_APP_URL: "https://app.example.com",
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
  SESSION_SECRET: "k3Wq9x_2mZ7vT1yB8nR4cH6jL0pD5sF3aG9uE2iO7xQ",
  SHOPIFY_BILLING_LIVE: "true",
  NODE_ENV: "production",
};
const codes = (findings: { code: string }[]) => findings.map((f) => f.code).sort();
const errorsOf = (env: Record<string, string | undefined>) =>
  checkEnvironment(env).filter((f) => f.level === "error");

describe("checkEnvironment (production)", () => {
  it("accepts a complete, correct production environment", () => {
    expect(checkEnvironment(good)).toEqual([]);
  });

  it("requires every documented variable", () => {
    expect(REQUIRED_ENV).toEqual([
      "DATABASE_URL",
      "DIRECT_URL",
      "SHOPIFY_API_KEY",
      "SHOPIFY_API_SECRET",
      "SHOPIFY_APP_URL",
      "NEXT_PUBLIC_APP_URL",
      "SESSION_SECRET",
    ]);
    for (const name of REQUIRED_ENV) {
      const findings = errorsOf({ ...good, [name]: undefined });
      expect(codes(findings), name).toContain("ENV_MISSING");
      expect(findings.map((f) => f.message).join(" ")).toContain(name);
      expect(
        errorsOf({ ...good, [name]: "   " }).some((f) => f.code === "ENV_MISSING"),
        name,
      ).toBe(true);
    }
  });

  it.each([
    "http://app.example.com",
    "https://localhost:3000",
    "https://127.0.0.1",
    "https://abc-def.trycloudflare.com",
    "https://x.ngrok-free.app",
    "https://x.ngrok.io",
    "https://x.loca.lt",
    "https://app.example.com/dashboard",
    "https://app.example.com/?x=1",
    "https://user:pass@app.example.com",
    "not a url",
  ])("refuses %s as the app URL", (bad) => {
    for (const name of ["SHOPIFY_APP_URL", "NEXT_PUBLIC_APP_URL"]) {
      const findings = errorsOf({
        ...good,
        [name]: bad,
        [name === "SHOPIFY_APP_URL" ? "NEXT_PUBLIC_APP_URL" : "SHOPIFY_APP_URL"]: bad,
      });
      expect(findings.length, `${name} ${bad}`).toBeGreaterThan(0);
    }
  });

  it("accepts a trailing slash and a port on a real host", () => {
    expect(
      errorsOf({
        ...good,
        SHOPIFY_APP_URL: "https://app.example.com/",
        NEXT_PUBLIC_APP_URL: "https://app.example.com",
      }),
    ).toEqual([]);
  });

  it("requires the two public URLs to be the same origin", () => {
    expect(codes(errorsOf({ ...good, NEXT_PUBLIC_APP_URL: "https://other.example.com" }))).toEqual([
      "URL_MISMATCH",
    ]);
  });

  it("refuses database URLs that are not postgres or point at this machine", () => {
    expect(codes(errorsOf({ ...good, DATABASE_URL: "mysql://x" }))).toContain("DB_URL_INVALID");
    expect(
      codes(errorsOf({ ...good, DIRECT_URL: "postgresql://u:p@localhost:5432/db" })),
    ).toContain("DB_URL_LOCAL");
    expect(codes(errorsOf({ ...good, DIRECT_URL: "postgresql://u:p@127.0.0.1/db" }))).toContain(
      "DB_URL_LOCAL",
    );
  });

  it("refuses a weak, placeholder or reused session secret", () => {
    expect(codes(errorsOf({ ...good, SESSION_SECRET: "short" }))).toContain("SESSION_SECRET_WEAK");
    expect(codes(errorsOf({ ...good, SESSION_SECRET: "changeme".padEnd(40, "x") })).length).toBe(0); // long enough; only exact placeholders are flagged
    expect(
      codes(errorsOf({ ...good, SESSION_SECRET: "your_secret_here_replace_me_now_please" })),
    ).toContain("SESSION_SECRET_PLACEHOLDER");
    expect(
      codes(
        errorsOf({
          ...good,
          SESSION_SECRET: good.SHOPIFY_API_SECRET.repeat(2),
          SHOPIFY_API_SECRET: good.SHOPIFY_API_SECRET.repeat(2),
        }),
      ),
    ).toContain("SECRET_REUSED");
  });

  it("refuses to run production with rate limiting off, and warns about test billing and disabled caches", () => {
    expect(codes(errorsOf({ ...good, RATE_LIMIT: "off" }))).toEqual(["RATE_LIMIT_OFF"]);
    const warnings = checkEnvironment({
      ...good,
      SHOPIFY_BILLING_LIVE: undefined,
      STOREFRONT_SHOP_CACHE_MS: "0",
      NODE_ENV: "development",
    });
    expect(
      warnings
        .filter((f) => f.level === "warn")
        .map((f) => f.code)
        .sort(),
    ).toEqual(["BILLING_TEST_MODE", "CACHE_OFF", "NODE_ENV"]);
    expect(hasErrors(warnings)).toBe(false);
  });

  it("never puts a value in a finding", () => {
    const secretish = {
      ...good,
      DATABASE_URL: "mysql://root:hunter2-very-secret@db",
      SESSION_SECRET: "short-secret-value",
      SHOPIFY_API_SECRET: "tiny-api-secret",
      SHOPIFY_APP_URL: "http://user:p4ssw0rd-leak@localhost:3000/path",
    };
    const text = JSON.stringify(checkEnvironment(secretish));
    for (const leak of [
      "hunter2",
      "short-secret-value",
      "tiny-api-secret",
      "p4ssw0rd-leak",
      "root:",
    ]) {
      expect(text, leak).not.toContain(leak);
    }
  });

  it("development mode does not demand production URLs", () => {
    const dev = checkEnvironment(
      {
        ...good,
        SHOPIFY_APP_URL: "https://x.trycloudflare.com",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      },
      "development",
    );
    expect(hasErrors(dev)).toBe(false);
  });
});

describe("isDevelopmentHost", () => {
  it.each([
    "localhost",
    "127.0.0.1",
    "foo.trycloudflare.com",
    "x.ngrok-free.app",
    "localhost:3000",
  ])("%s is a development host", (h) => {
    expect(isDevelopmentHost(h)).toBe(true);
  });
  it.each(["app.example.com", "bundlecraft.vercel.app", "trycloudflare.com.example.org"])(
    "%s is not",
    (h) => {
      expect(isDevelopmentHost(h)).toBe(false);
    },
  );
});

describe("checkAppToml", () => {
  const dev = readFileSync("shopify.app.toml", "utf8");
  const template = readFileSync("shopify.app.production.toml.example", "utf8");
  const filled = template
    .replaceAll("<your-domain>", "app.example.com")
    .replace("<32-character-client-id-of-the-production-app>", "b1bb31de362b73dbacfb0bd6de6cf6d1");
  const expectedScopes = SHOPIFY_SCOPES;

  it("the development file is valid in development mode (localhost is allowed there)", () => {
    expect(checkAppToml(dev, { production: false, expectedScopes })).toEqual([]);
  });

  it("the development file is NOT production ready (localhost), which is the point of a separate production file", () => {
    const findings = checkAppToml(dev, { production: true, expectedScopes });
    expect(codes(findings)).toContain("TOML_URL_DEVELOPMENT_HOST");
    expect(codes(findings)).toContain("TOML_DEV_URL_REWRITE");
  });

  it("the production template, once filled in, passes the strict check", () => {
    expect(checkAppToml(filled, { production: true, expectedScopes })).toEqual([]);
  });

  it("the production template refuses to pass while it still has placeholders", () => {
    const findings = checkAppToml(template, { production: true, expectedScopes });
    expect(hasErrors(findings)).toBe(true);
    expect(codes(findings)).toContain("TOML_CLIENT_ID");
  });

  it("the template holds no secret and no development URL", () => {
    expect(template).not.toMatch(/secret\s*=|localhost|trycloudflare|ngrok|shpat_|shpss_/i);
  });

  it.each([
    ["scopes changed", (t: string) => t.replace("write_discounts", "write_orders"), "TOML_SCOPES"],
    [
      "a redirect on another host",
      (t: string) =>
        t.replace(
          "https://app.example.com/api/auth/callback",
          "https://evil.example/api/auth/callback",
        ),
      "TOML_REDIRECT_MISMATCH",
    ],
    [
      "a redirect to another path",
      (t: string) => t.replace("/api/auth/callback", "/callback"),
      "TOML_REDIRECT_MISMATCH",
    ],
    [
      "the proxy pointing elsewhere",
      (t: string) =>
        t.replace("https://app.example.com/api/storefront", "https://app.example.com/api/other"),
      "TOML_PROXY_MISMATCH",
    ],
    [
      "a different proxy subpath",
      (t: string) => t.replace('subpath = "bundlecraft"', 'subpath = "bundles"'),
      "TOML_PROXY_PATH",
    ],
    [
      "a missing privacy webhook",
      (t: string) => t.replace('"shop/redact"', '"shop/other"'),
      "TOML_COMPLIANCE",
    ],
    [
      "not embedded",
      (t: string) => t.replace("embedded = true", "embedded = false"),
      "TOML_EMBEDDED",
    ],
    [
      "http",
      (t: string) => t.replace('application_url = "https', 'application_url = "http'),
      "TOML_URL_NOT_HTTPS",
    ],
    [
      "a tunnel",
      (t: string) => t.replaceAll("app.example.com", "x.trycloudflare.com"),
      "TOML_URL_DEVELOPMENT_HOST",
    ],
  ])("catches %s", (_name, mutate, code) => {
    expect(codes(checkAppToml(mutate(filled), { production: true, expectedScopes }))).toContain(
      code,
    );
  });
});
