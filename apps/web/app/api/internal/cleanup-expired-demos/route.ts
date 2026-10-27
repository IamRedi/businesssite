import { NextResponse } from "next/server";
import { PostgresSiteRepository } from "@platform/site-data";
import { createHash, timingSafeEqual } from "node:crypto";
import { demoCleanupExecutionEnabled } from "../../../../lib/execution-gates";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(
    digest(request.headers.get("authorization") ?? ""),
    digest(`Bearer ${secret}`),
  );
}

export async function GET(request: Request) {
  if (!authorized(request))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!demoCleanupExecutionEnabled())
    return NextResponse.json({ error: "Demo cleanup execution is disabled." }, { status: 503 });
  const deleted = await new PostgresSiteRepository({ boundary: "system" }).deleteExpiredDemos();
  return NextResponse.json({ deleted });
}
