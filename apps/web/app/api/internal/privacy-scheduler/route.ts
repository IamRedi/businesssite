import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  privacySchedulerConfiguration,
  runPrivacyScheduler,
} from "../../../../lib/privacy-scheduler";

const digest = (value: string) => createHash("sha256").update(value).digest();
const authorized = (request: Request) => {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(
    secret &&
    secret.length >= 32 &&
    timingSafeEqual(
      digest(request.headers.get("authorization") ?? ""),
      digest(`Bearer ${secret}`),
    ),
  );
};

export async function GET(request: Request) {
  if (!authorized(request))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const configuration = privacySchedulerConfiguration();
    if (!configuration.enabled)
      return NextResponse.json(
        { enabled: false, acquired: false },
        { headers: { "cache-control": "no-store" } },
      );
    const result = await runPrivacyScheduler();
    return NextResponse.json(result, {
      status: result.acquired ? 200 : 202,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Privacy scheduler failed." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
