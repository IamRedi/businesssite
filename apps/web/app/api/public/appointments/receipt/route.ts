import { NextResponse } from "next/server";
import { readJsonBody } from "../../../../../lib/request-body";
import { appointmentV1Http, appointmentReceiptRateLimit, appointmentResponse } from "../../../../../lib/appointment-v1-http";
export async function POST(request: Request) {
  try {
    const rate = await appointmentReceiptRateLimit(request);
    if (!rate.allowed) return NextResponse.json({ errorCode: "rate_limited" }, { status: 429,
      headers: { "retry-after": String(rate.retryAfterSeconds ?? 60), "cache-control": "private, no-store" } });
    const body = await readJsonBody<unknown>(request, 1024);
    if (!body.ok) return NextResponse.json({ errorCode: "invalid_request" }, { status: body.status, headers: { "cache-control": "private, no-store" } });
    return appointmentV1Http(request, body.value, true);
  } catch { return appointmentResponse({ errorCode: "temporarily_unavailable" }); }
}
