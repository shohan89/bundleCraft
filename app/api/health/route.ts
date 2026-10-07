import { NextResponse } from "next/server";
import { logEvent, errorFields } from "@/lib/log";
import { prisma } from "@/lib/prisma";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Deployment smoke test and uptime probe: is the app up, and can it reach its database? Public on
 * purpose (a load balancer or uptime check has no session) and therefore minimal: it returns two
 * words, never a version, host, connection detail or error message, and touches no tenant data.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "ok" }, { headers: NO_STORE });
  } catch (error) {
    logEvent("error", "health_database_unavailable", errorFields(error));
    return NextResponse.json(
      { status: "degraded", database: "unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }
}
