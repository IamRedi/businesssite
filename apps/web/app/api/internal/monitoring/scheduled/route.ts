import { NextResponse } from "next/server";
import {
  runScheduledOperationalMonitoringCheck,
  stagingSchedulerConfiguration,
} from "../../../../../lib/operational-monitoring";

export async function GET(request: Request) {
  let configuration;
  try {
    configuration = stagingSchedulerConfiguration();
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!configuration.enabled)
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (new URL(request.url).searchParams.get("key") !== configuration.secret)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const result = await runScheduledOperationalMonitoringCheck();
  if (!result.enabled)
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  const hasSignals = result.snapshot.signals.length > 0;
  return NextResponse.json(
    {
      schema: result.snapshot.schema,
      checkedAt: result.snapshot.checkedAt,
      status: result.snapshot.status,
      signals: result.snapshot.signals.map((signal) => signal.code),
      delivered: result.delivery.filter((item) => item === "delivered").length,
      deliveryHealthy: result.deliveryHealthy,
    },
    {
      status: !result.deliveryHealthy || hasSignals ? 503 : 200,
      headers: { "cache-control": "no-store" },
    },
  );
}
