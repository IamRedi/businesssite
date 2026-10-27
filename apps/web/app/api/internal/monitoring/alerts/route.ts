import { NextResponse } from "next/server";
import { runOperationalMonitoringCheck } from "../../../../../lib/operational-monitoring";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const result = await runOperationalMonitoringCheck({
    synthetic: request.headers.get("x-businesssite-monitoring-probe") === "b6a",
  });
  if (!result.enabled)
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  const hasLiveSignals = result.snapshot.signals.length > 0;
  const status = !result.deliveryHealthy || hasLiveSignals ? 503 : 200;
  return NextResponse.json(
    {
      schema: result.snapshot.schema,
      checkedAt: result.snapshot.checkedAt,
      status: result.snapshot.status,
      signals: result.snapshot.signals.map((signal) => signal.code),
      synthetic: result.synthetic,
      delivered: result.delivery.filter((item) => item === "delivered").length,
      deliveryHealthy: result.deliveryHealthy,
    },
    { status, headers: { "cache-control": "no-store" } },
  );
}
