// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Repository and build hygiene for production (ACTION-017): nothing secret is committed, the
 * environment template documents every variable the code reads, migrations are safe to apply to
 * a production database, and the build works from a clean checkout.
 */
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Every file git would commit: tracked files plus untracked files that are not ignored. */
function committable(): string[] {
  try {
    return execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}
const files = committable();
const isText = (path: string) =>
  !/\.(png|jpe?g|gif|ico|webp|wasm|lock)$/i.test(path) && path !== "package-lock.json";
const isTest = (path: string) => /\.test\.(ts|tsx)$/.test(path);

describe("secrets and environment files", () => {
  it.skipIf(files.length === 0)(
    "no real environment file is committable (only .env.example)",
    () => {
      const env = files.filter((f) => /(^|\/)\.env/.test(f));
      expect(env).toEqual([".env.example"]);
    },
  );

  it("`.gitignore` ignores env files, local Shopify state and the generated Prisma client", () => {
    const ignore = read(".gitignore");
    expect(ignore).toMatch(/^\.env\*/m);
    expect(ignore).toMatch(/^!\.env\.example/m);
    expect(ignore).toMatch(/^\.shopify\//m);
    expect(ignore).toMatch(/^\/lib\/generated\/prisma/m);
  });

  it(".env.example holds no values at all (every line is empty or a comment)", () => {
    for (const line of read(".env.example").split(/\r?\n/)) {
      if (line.trim() === "" || line.startsWith("#")) continue;
      expect(line, line).toMatch(/^[A-Z][A-Z0-9_]*=$/);
    }
  });

  it.skipIf(files.length === 0)("no non-test file contains a credential-shaped string", () => {
    const patterns = [
      /shp(at|ss|ca|pa)_[0-9a-fA-F]{20,}/,
      /postgres(ql)?:\/\/[^\s:@/]+:[^\s@/]+@[^\s"'`]+/,
      /sk_live_[0-9a-zA-Z]{10,}/,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
      /AKIA[0-9A-Z]{16}/,
    ];
    const hits: string[] = [];
    for (const file of files) {
      if (!isText(file) || isTest(file) || !existsSync(join(root, file))) continue;
      if (statSync(join(root, file)).size > 2_000_000) continue;
      const text = read(file);
      for (const pattern of patterns)
        if (pattern.test(text)) hits.push(`${file} matches ${pattern}`);
    }
    expect(hits).toEqual([]);
  });

  it.skipIf(files.length === 0 || !existsSync(join(root, ".env")))(
    "no committable file contains a secret value from the local .env",
    () => {
      const secrets = read(".env")
        .split(/\r?\n/)
        .map((line) =>
          /^(DATABASE_URL|DIRECT_URL|SHOPIFY_API_SECRET|SESSION_SECRET)=(.*)$/.exec(line.trim()),
        )
        .flatMap((match) => (match ? [match[2].replace(/^["']|["']$/g, "")] : []))
        .filter((value) => value.length >= 16);
      const leaked: string[] = [];
      for (const file of files) {
        if (!isText(file) || file === ".env" || !existsSync(join(root, file))) continue;
        if (statSync(join(root, file)).size > 2_000_000) continue;
        const text = read(file);
        if (secrets.some((secret) => text.includes(secret))) leaked.push(file); // names the file, never the value
      }
      expect(leaked).toEqual([]);
    },
  );
});

describe(".env.example documents everything the code reads", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory())
        return entry.name === "generated" || entry.name === "node_modules" ? [] : sourceFiles(path);
      return /\.(ts|tsx|mjs)$/.test(entry.name) && !isTest(path) ? [path] : [];
    });
  }

  it("every environment variable referenced by application code appears in .env.example", () => {
    const example = read(".env.example");
    const used = new Set<string>();
    for (const dir of ["app", "lib", "services", "storefront", "components"]) {
      for (const file of sourceFiles(dir)) {
        const text = read(file);
        for (const m of text.matchAll(
          /process\.env\.([A-Z][A-Z0-9_]*)|process\.env\["([A-Z][A-Z0-9_]*)"\]|requiredEnv\("([A-Z][A-Z0-9_]*)"\)/g,
        )) {
          used.add(m[1] ?? m[2] ?? m[3]);
        }
      }
    }
    for (const file of [
      "proxy.ts",
      "next.config.ts",
      "prisma7.config.ts",
      "prisma/seed.ts",
      "scripts/check-production.ts",
    ]) {
      for (const m of read(file).matchAll(
        /process\.env\.([A-Z][A-Z0-9_]*)|process\.env\["([A-Z][A-Z0-9_]*)"\]/g,
      ))
        used.add(m[1] ?? m[2]);
    }
    used.delete("NODE_ENV"); // set by the platform, not by us
    const undocumented = [...used].filter(
      (name) => !new RegExp(`^#?\\s*${name}=`, "m").test(example),
    );
    expect(undocumented).toEqual([]);
  });

  it("the required production variables are all present (uncommented) in .env.example", () => {
    const example = read(".env.example");
    for (const name of [
      "DATABASE_URL",
      "DIRECT_URL",
      "SHOPIFY_API_KEY",
      "SHOPIFY_API_SECRET",
      "SHOPIFY_APP_URL",
      "NEXT_PUBLIC_APP_URL",
      "SESSION_SECRET",
    ]) {
      expect(example, name).toMatch(new RegExp(`^${name}=`, "m"));
    }
  });
});

describe("migrations are safe for a production database", () => {
  const dirs = readdirSync(join(root, "prisma/migrations"))
    .filter((d) => /^\d{14}_/.test(d))
    .sort();

  it("are ordered by timestamp with no duplicates, and the lock file names PostgreSQL", () => {
    expect(new Set(dirs).size).toBe(dirs.length);
    expect(dirs).toEqual([...dirs].sort());
    expect(read("prisma/migrations/migration_lock.toml")).toMatch(/provider\s*=\s*"postgresql"/);
    for (const dir of dirs)
      expect(existsSync(join(root, "prisma/migrations", dir, "migration.sql")), dir).toBe(true);
  });

  it("never drop a table or a column, truncate, or delete rows (only reviewed, non-data statements)", () => {
    const risky: string[] = [];
    for (const dir of dirs) {
      const sql = read(`prisma/migrations/${dir}/migration.sql`).replace(/--.*$/gm, "");
      for (const pattern of [
        /DROP\s+TABLE/i,
        /DROP\s+COLUMN/i,
        /TRUNCATE/i,
        /DELETE\s+FROM/i,
        /DROP\s+SCHEMA/i,
        /DROP\s+TYPE/i,
      ]) {
        if (pattern.test(sql)) risky.push(`${dir}: ${pattern}`);
      }
    }
    expect(risky).toEqual([]);
  });

  it("the only DROP statements are the reviewed index and default drops", () => {
    const drops = dirs.flatMap((dir) =>
      [
        ...read(`prisma/migrations/${dir}/migration.sql`)
          .replace(/--.*$/gm, "")
          .matchAll(
            /(DROP INDEX "[^"]+"|ALTER COLUMN "[^"]+" DROP DEFAULT|ALTER COLUMN "[^"]+" DROP NOT NULL)/g,
          ),
      ].map((m) => `${dir.slice(0, 14)} ${m[1]}`),
    );
    expect(drops).toEqual([
      '20260926120000 DROP INDEX "subscriptions_shop_id_key"',
      '20260926200000 ALTER COLUMN "updated_at" DROP DEFAULT',
      '20260927200000 DROP INDEX "analytics_events_shop_id_idx"',
      '20260927200000 DROP INDEX "analytics_events_bundle_id_idx"',
    ]);
  });
});

describe("build and run configuration", () => {
  const pkg = JSON.parse(read("package.json")) as {
    scripts: Record<string, string>;
    engines?: { node?: string };
  };

  it("generates the (git-ignored) Prisma client before building, on install and in the build", () => {
    expect(pkg.scripts.postinstall).toBe("prisma generate");
    expect(pkg.scripts.build).toBe("prisma generate && next build");
  });

  it("has the documented commands", () => {
    expect(pkg.scripts.start).toBe("next start");
    expect(pkg.scripts["db:deploy"]).toBe("prisma migrate deploy");
    expect(pkg.scripts["check:production"]).toBe("tsx scripts/check-production.ts");
  });

  it("declares a Node version range that both Next.js and Prisma support", () => {
    expect(pkg.engines?.node).toBe("^20.19.0 || ^22.12.0 || >=24.0.0");
  });

  it("the storefront widget asset is committed (theme extensions have no build step)", () => {
    expect(existsSync(join(root, "extensions/bundle-widget/assets/bundlecraft-widget.js"))).toBe(
      true,
    );
    expect(read(".gitignore")).not.toMatch(/bundlecraft-widget/);
  });
});
