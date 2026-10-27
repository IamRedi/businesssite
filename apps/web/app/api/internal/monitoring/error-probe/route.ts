import { NextResponse } from "next/server";

const stagingProbeEnabled = () =>
  process.env.MONITORING_SYNTHETIC_PROBE_ENABLED?.trim() === "true" &&
  process.env.RELEASE_TARGET?.trim() === "staging" &&
  process.env.VERCEL_ENV?.trim() !== "production";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (
    !secret ||
    request.headers.get("authorization") !== `Bearer ${secret}`
  )
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!stagingProbeEnabled())
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  throw new Error("B6A_SYNTHETIC_OPERATIONAL_ERROR");
}
