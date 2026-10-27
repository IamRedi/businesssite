import { NextResponse } from "next/server";
import { PostgresSiteRepository, publicBookingConfig, publicBookingSlots, requestBooking } from "@platform/site-data";
import { configuredPlatformHosts, normalizeRequestHost, trustedCustomerDomainHost } from "../../../../lib/host-security";
import { readJsonBody } from "../../../../lib/request-body";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { abusePolicy } from "../../../../lib/abuse-policy";

const headers = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
const slugPattern = /^[a-z0-9][a-z0-9-]{0,119}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

async function allowedSite(request: Request, slug: string) {
  const host = normalizeRequestHost(request.headers.get("host") ?? new URL(request.url).host);
  if (!host || !slugPattern.test(slug)) return false;
  const sites = new PostgresSiteRepository({ boundary: "runtime" });
  const site = await sites.getPublicBySlug(slug);
  if (!site) return false;
  if (configuredPlatformHosts().has(host)) return true;
  const domain = trustedCustomerDomainHost(host);
  const bound = domain ? await sites.getByVerifiedCustomDomain(domain) : null;
  return bound?.id === site.id;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug") ?? "";
    if (!(await allowedSite(request, slug))) return NextResponse.json({ errorCode: "not_found" }, { status: 404, headers });
    const config = await publicBookingConfig(slug);
    const day = url.searchParams.get("date");
    if (!day) return NextResponse.json(config, { headers });
    if (!datePattern.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`)))
      return NextResponse.json({ errorCode: "invalid_request" }, { status: 400, headers });
    return NextResponse.json({ ...config, slots: config.enabled ? await publicBookingSlots(slug, day) : [] }, { headers });
  } catch { return NextResponse.json({ errorCode: "unavailable" }, { status: 503, headers }); }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== (request.headers.get("host") ?? new URL(request.url).host))
      return NextResponse.json({ errorCode: "forbidden" }, { status: 403, headers });
    const limit = await enforceRateLimit(request, "public-appointment", abusePolicy.appointment.network.limit, abusePolicy.appointment.network.windowSeconds);
    if (!limit.allowed) return NextResponse.json({ errorCode: "rate_limited" }, { status: 429, headers });
    const body = await readJsonBody<unknown>(request, 4096);
    if (!body.ok || !body.value || typeof body.value !== "object" || Array.isArray(body.value))
      return NextResponse.json({ errorCode: "invalid_request" }, { status: 400, headers });
    const value = body.value as Record<string, unknown>;
    if (Object.keys(value).some(key => !["slug","start","service","name","phone","email"].includes(key)) ||
      typeof value.slug !== "string" || typeof value.start !== "string" || !instantPattern.test(value.start) ||
      typeof value.service !== "string" || typeof value.name !== "string" || typeof value.phone !== "string" ||
      (value.email !== undefined && typeof value.email !== "string") || !(await allowedSite(request, value.slug)))
      return NextResponse.json({ errorCode: "invalid_request" }, { status: 400, headers });
    const result = await requestBooking(value.slug,value.start,value.service,value.name,value.phone,value.email ?? "");
    return NextResponse.json(result, { status: "errorCode" in result ? result.errorCode === "slot_unavailable" ? 409 : 400 : 201, headers });
  } catch { return NextResponse.json({ errorCode: "unavailable" }, { status: 503, headers }); }
}
