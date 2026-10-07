// @vitest-environment node
import "dotenv/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import * as route from "./route";

afterEach(() => vi.restoreAllMocks());

describe("GET /api/health", () => {
  it("is read-only: only GET exists", () => {
    expect(Object.keys(route)).toEqual(["GET"]);
  });

  it.skipIf(!process.env.DATABASE_URL)(
    "reports ok when the database answers, in two words and no more",
    async () => {
      const response = await route.GET();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok", database: "ok" });
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );

  it("reports degraded with 503 when the database is down, without any detail", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma, "$queryRaw").mockRejectedValue(
      new Error(
        "connect ECONNREFUSED postgresql://user:pw123@db.internal:5432/app shpat_0123456789abcdef",
      ),
    );
    const response = await route.GET();
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ status: "degraded", database: "unavailable" });
    for (const leak of ["ECONNREFUSED", "pw123", "db.internal", "postgresql", "shpat_"]) {
      expect(text, leak).not.toContain(leak);
    }
    // The operator still gets one scrubbed line to act on.
    expect(logged).toHaveBeenCalledTimes(1);
    const line = String(logged.mock.calls[0][0]);
    expect(JSON.parse(line)).toMatchObject({ event: "health_database_unavailable" });
    for (const leak of ["pw123", "shpat_0123", "user:pw"]) expect(line, leak).not.toContain(leak);
  });

  it("needs no session and returns no tenant data", async () => {
    // No cookie, no signature: it is meant for load balancers and uptime probes.
    const response = await route.GET();
    const text = await response.text();
    expect(text).not.toMatch(/shop|bundle|merchant|version|host|token/i);
  });
});
