// Runs the BUILT WebAssembly module through Shopify's function-runner against each fixture, and
// validates the input query, fixtures, and outputs against Shopify's Function schema.
// Run with `npm run test:function`. Regenerate fixtures with `node tests/fixtures/generate.mjs`.
import path from "path";
import fs from "fs";
import { describe, beforeAll, test, expect } from "vitest";
import {
  buildFunction,
  getFunctionInfo,
  loadSchema,
  loadInputQuery,
  loadFixture,
  validateTestAssets,
  runFunction,
} from "@shopify/shopify-function-test-helpers";

describe("bundle discount Function (built wasm)", () => {
  let schema;
  let functionInfo;

  beforeAll(async () => {
    const functionDir = path.dirname(__dirname);
    await buildFunction(functionDir);
    functionInfo = await getFunctionInfo(functionDir);
    schema = await loadSchema(functionInfo.schemaPath);
  }, 120000);

  const fixturesDir = path.join(__dirname, "fixtures");
  const fixtureFiles = fs
    .readdirSync(fixturesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(fixturesDir, file));

  fixtureFiles.forEach((fixtureFile) => {
    test(`runs ${path.relative(fixturesDir, fixtureFile)}`, async () => {
      const { schemaPath, functionRunnerPath, wasmPath, targeting } = functionInfo;
      const fixture = await loadFixture(fixtureFile);
      const targetInputQueryPath = targeting[fixture.target].inputQueryPath;
      const inputQueryAST = await loadInputQuery(targetInputQueryPath);

      const validation = await validateTestAssets({ schema, fixture, inputQueryAST });
      expect(validation.inputQuery.errors).toEqual([]);
      expect(validation.inputFixture.errors).toEqual([]);
      expect(validation.outputFixture.errors).toEqual([]);

      const run = await runFunction(
        fixture,
        functionRunnerPath,
        wasmPath,
        targetInputQueryPath,
        schemaPath,
      );
      expect(run.error).toBeNull();
      expect(run.result?.output).toEqual(fixture.expectedOutput);
    }, 20000);
  });
});
