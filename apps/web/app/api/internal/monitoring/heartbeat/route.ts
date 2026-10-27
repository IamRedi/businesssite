import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { PostgresOperationalMonitoringRepository } from "@platform/site-data";
import {
  operationalHeartbeatThresholds,
  productionHeartbeatConfiguration,
  stagingSchedulerConfiguration,
} from "../../../../../lib/operational-monitoring";

const digest = (value: string) => createHash("sha256").update(value).digest();
const bearerAuthorized = (request: Request, secret: string) =>
  secret.length >= 32 &&
  timingSafeEqual(
    digest(request.headers.get("authorization") ?? ""),
    digest(`Bearer ${secret}`),
  );

export async function GET(request: Request) {
  let staging;
  let production;
  try {
    staging = stagingSchedulerConfiguration();
    production = productionHeartbeatConfiguration();
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!staging.enabled && !production.enabled)
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  const url = new URL(request.url);
  const authorized = production.enabled
    ? bearerAuthorized(request, production.secret)
    : url.searchParams.get("key") === staging.secret;
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const heartbeat = await new PostgresOperationalMonitoringRepository().heartbeat(
    operationalHeartbeatThresholds(),
  );
  const healthy = heartbeat.status === "healthy" || heartbeat.status === "running";
  return NextResponse.json(heartbeat, {
    status: healthy ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
