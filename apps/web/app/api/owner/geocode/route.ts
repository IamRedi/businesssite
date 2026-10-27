import { NextResponse } from "next/server";
import { GoogleGeocoder, PostgresFinderRepository, type GeoPoint } from "@platform/business-finder";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { authorizeOwnerRequest } from "../../../../lib/owner-authorization";
import { readJsonBody } from "../../../../lib/request-body";
import { providerControlError } from "../../../../lib/provider-controls";

export async function POST(request: Request) {
  const authorization = await authorizeOwnerRequest(request, "finder.write");
  if (!authorization.ok) return authorization.response;
  try {
    const parsed = await readJsonBody<{ location?: GeoPoint }>(request, 2 * 1024);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const body = parsed.value;
    const latitude = body.location?.latitude;
    const longitude = body.location?.longitude;
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return NextResponse.json({ error: "Device coordinates are required." }, { status: 400 });
    }
    const rateLimit = await enforceRateLimit(request, "owner-device-geocode", 60, 60 * 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Too many address lookups. Please try again shortly." }, { status: 429 });
    }
    const repository = new PostgresFinderRepository({ boundary: "owner", sessionHash: authorization.owner.sessionHash });
    const location = await new GoogleGeocoder((usage) => repository.recordProviderUsage(usage)).resolveCoordinates(latitude, longitude);
    return NextResponse.json({ location });
  } catch (error) {
    if (error instanceof Error && /provider_(paused|google_limit)/.test(error.message)) { const failure = providerControlError(error); return NextResponse.json({ error: failure.message }, { status: failure.status }); }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to identify your device location." }, { status: 500 });
  }
}
