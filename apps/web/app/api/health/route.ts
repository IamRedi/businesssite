import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Liveness is deliberately independent from PostgreSQL. External uptime checks
// must not wake Neon's production compute just to check whether the app is up.
export async function GET() {
  return NextResponse.json(
    { status: "ok", service: "ok", database: "not_checked" },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
