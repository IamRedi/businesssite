import { NextResponse } from "next/server";
import { PostgresSiteRepository } from "@platform/site-data";

export const dynamic = "force-dynamic";

// Database readiness is an explicit, separate check; do not poll it as uptime.
export async function GET() {
  try {
    await new PostgresSiteRepository({ boundary: "runtime" }).healthCheck();
    return NextResponse.json(
      { status: "ok", database: "ok" },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error &&
      typeof error.code === "string" ? error.code : undefined;
    const message = error instanceof Error &&
      !/(?:postgres(?:ql)?:\/\/|password|secret|token|@)/i.test(error.message)
      ? error.message.slice(0, 200) : "redacted";
    console.error("[health/ready] database check failed", {
      name: error instanceof Error ? error.name : "unknown",
      code,
      message,
      readiness: error instanceof Error && error.message === "Enforced database invariants are not ready.",
    });
    return NextResponse.json(
      { status: "degraded", database: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
