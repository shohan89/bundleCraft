// @vitest-environment node
import "dotenv/config";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Asserts the facts docs/04-DATABASE_DESIGN.md and CLAUDE.md promise about
 * the LIVE database, straight from the catalog: tables, tenant foreign keys
 * (with the delete behaviour that keeps a shop's data removable), uniqueness
 * that prevents duplicates, the indexes analytics and lookups rely on, and a
 * clean, ordered migration history.
 */
const canRun = Boolean(process.env.DIRECT_URL || process.env.DATABASE_URL);
let client: pg.Client;

const rows = async (sql: string) => (await client.query(sql)).rows as Record<string, string>[];

describe.skipIf(!canRun)("live database schema", () => {
  beforeAll(async () => {
    client = new pg.Client({
      connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
    });
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
  });

  it("has every expected table", async () => {
    const tables = (
      await rows(
        "select table_name from information_schema.tables where table_schema='public' and table_name <> '_prisma_migrations'",
      )
    ).map((r) => r.table_name);
    expect(tables.sort()).toEqual(
      [
        "analytics_events",
        "bundle_products",
        "bundles",
        "customizations",
        "shops",
        "subscriptions",
        "templates",
        "users",
        "product_variants",
        "products",
        "webhook_events",
      ].sort(),
    );
  });

  it("every table has a uuid primary key and created_at", async () => {
    const tables = await rows(
      "select table_name from information_schema.tables where table_schema='public' and table_name <> '_prisma_migrations'",
    );
    for (const { table_name } of tables) {
      const cols = await rows(
        `select column_name, data_type from information_schema.columns where table_schema='public' and table_name='${table_name}'`,
      );
      const byName = Object.fromEntries(cols.map((c) => [c.column_name, c.data_type]));
      expect(byName.id, `${table_name}.id`).toBe("uuid");
      expect(byName.created_at ?? byName.installed_at, `${table_name}.created_at`).toBeTruthy();
    }
  });

  it("tenant foreign keys exist and cascade, so removing a shop removes all its data", async () => {
    const fks = await rows(
      `select conrelid::regclass::text as t, confrelid::regclass::text as ref, confdeltype as del
         from pg_constraint where contype='f' and connamespace='public'::regnamespace`,
    );
    const has = (t: string, ref: string, del: string) =>
      fks.some((fk) => fk.t === t && fk.ref === ref && fk.del === del);
    expect(has("bundles", "shops", "c")).toBe(true);
    expect(has("subscriptions", "shops", "c")).toBe(true);
    expect(has("analytics_events", "shops", "c")).toBe(true);
    expect(has("analytics_events", "bundles", "c")).toBe(true);
    expect(has("bundle_products", "bundles", "c")).toBe(true);
    expect(has("customizations", "bundles", "c")).toBe(true);
    // A deleted template must not delete the merchant's bundles.
    expect(has("bundles", "templates", "n")).toBe(true);
    expect(has("webhook_events", "shops", "c")).toBe(true);
    expect(has("products", "shops", "c")).toBe(true);
    expect(has("product_variants", "shops", "c")).toBe(true);
    expect(has("product_variants", "products", "c")).toBe(true);
  });

  it("required columns are NOT NULL and intentional ones are nullable", async () => {
    const nullable = async (table: string) =>
      Object.fromEntries(
        (
          await rows(
            `select column_name, is_nullable from information_schema.columns where table_schema='public' and table_name='${table}'`,
          )
        ).map((c) => [c.column_name, c.is_nullable === "YES"]),
      );
    const bundles = await nullable("bundles");
    expect(bundles).toMatchObject({
      shop_id: false,
      title: false,
      bundle_type: false,
      discount_type: false,
      discount_value: false,
      status: false,
      description: true,
      required_quantity: true,
      shopify_discount_id: true,
    });
    expect(await nullable("shops")).toMatchObject({ shop_domain: false, access_token: false });
    expect(await nullable("subscriptions")).toMatchObject({
      shop_id: false,
      shopify_charge_id: false,
      plan: false,
      status: false,
      confirmation_url: true,
    });
    expect(await nullable("analytics_events")).toMatchObject({
      shop_id: false,
      bundle_id: false,
      event_type: false,
      revenue: true,
      currency: true,
      event_key: true,
    });
  });

  it("uniqueness rules that prevent duplicates are enforced by the database", async () => {
    const unique = (
      await rows(
        `select indexdef from pg_indexes where schemaname='public' and indexdef like 'CREATE UNIQUE%'`,
      )
    ).map((r) => r.indexdef);
    const has = (fragment: string) => unique.some((d) => d.includes(fragment));
    expect(has("ON public.shops USING btree (shop_domain)")).toBe(true);
    expect(has("ON public.subscriptions USING btree (shopify_charge_id)")).toBe(true);
    expect(has("ON public.bundles USING btree (shopify_discount_id)")).toBe(true);
    expect(has("ON public.analytics_events USING btree (shop_id, event_key)")).toBe(true);
    expect(has("ON public.customizations USING btree (bundle_id)")).toBe(true);
    // A Shopify product or variant id is unique within one shop, never globally.
    expect(has("ON public.products USING btree (shop_id, shopify_product_id)")).toBe(true);
    expect(has("ON public.product_variants USING btree (shop_id, shopify_variant_id)")).toBe(true);
    // A webhook event id is scoped to shop and topic, never assumed globally unique.
    expect(has("ON public.webhook_events USING btree (shop_id, topic, event_id)")).toBe(true);
  });

  it("has the indexes the tenant, analytics and billing queries use", async () => {
    const indexes = (await rows("select indexdef from pg_indexes where schemaname='public'")).map(
      (r) => r.indexdef,
    );
    const has = (fragment: string) => indexes.some((d) => d.includes(fragment));
    expect(has("ON public.bundles USING btree (shop_id)")).toBe(true);
    expect(has("ON public.analytics_events USING btree (shop_id, event_type, created_at)")).toBe(
      true,
    );
    expect(has("ON public.analytics_events USING btree (bundle_id, event_type, created_at)")).toBe(
      true,
    );
    expect(has("ON public.subscriptions USING btree (shop_id, status)")).toBe(true);
    expect(has("ON public.webhook_events USING btree (status, updated_at)")).toBe(true);
    expect(has("ON public.products USING btree (shop_id, status)")).toBe(true);
    expect(has("ON public.product_variants USING btree (product_id)")).toBe(true);
  });

  it("migrations are sequential, all applied, and none failed or rolled back", async () => {
    const onDisk = readdirSync(join(process.cwd(), "prisma", "migrations"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const applied = await rows(
      "select migration_name, finished_at, rolled_back_at from _prisma_migrations order by migration_name",
    );
    expect(applied.map((m) => m.migration_name)).toEqual(onDisk);
    for (const migration of applied) {
      expect(migration.finished_at, migration.migration_name).not.toBeNull();
      expect(migration.rolled_back_at, migration.migration_name).toBeNull();
    }
    // Timestamps strictly increase: history was never rewritten in the middle.
    const stamps = onDisk.map((name) => name.split("_")[0]);
    expect(new Set(stamps).size).toBe(stamps.length);
  });
});
