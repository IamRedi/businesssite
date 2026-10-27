import { NextResponse } from "next/server";
import { PostgresSiteRepository, appointmentReceiptDigest, type AppointmentV1Result } from "@platform/site-data";
import { configuredPlatformHosts, normalizeRequestHost, trustedCustomerDomainHost } from "./host-security";
import { clientAddress, enforceRateLimit, enforceSubjectRateLimit } from "./rate-limit";
import { abusePolicy } from "./abuse-policy";
import { tenantQuotas } from "./tenant-usage-policy";
import { parseAppointmentV1 } from "./appointment-v1";

export function appointmentResponse(result: AppointmentV1Result | undefined) {
  const headers: Record<string, string> = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
  if (!result) return NextResponse.json({ errorCode: "temporarily_unavailable" }, { status: 503, headers });
  if ("errorCode" in result) {
    const statuses = { invalid_request: 400, not_found: 404, capability_disabled: 403,
      idempotency_conflict: 409, capability_expired: 410, temporarily_unavailable: 503,
      service_selection_required: 422, quota_reached: 429 } as const;
    if (result.errorCode === "quota_reached") headers["retry-after"] = String(result.retryAfterSeconds ?? 60);
    return NextResponse.json({ errorCode: result.errorCode }, { status: statuses[result.errorCode] ?? 503, headers });
  }
  return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers });
}
export async function appointmentV1Http(request: Request, body: unknown, receiptOnly = false) {
  try {
    if (!body || typeof body !== "object" || Array.isArray(body)) return appointmentResponse({ errorCode: "invalid_request" });
    const raw = body as Record<string, unknown>;
    const input = receiptOnly ? null : parseAppointmentV1(body);
    if (receiptOnly ? raw.contractVersion !== 1 || typeof raw.slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(raw.slug) || Object.keys(raw).some(k => k !== "contractVersion" && k !== "slug") : !input)
      return appointmentResponse({ errorCode: "invalid_request" });
    const key = request.headers.get("idempotency-key");
    if (!key) return NextResponse.json({ errorCode: "missing_idempotency_key" }, { status: 400, headers: { "cache-control": "private, no-store" } });
    try { appointmentReceiptDigest(key); } catch { return appointmentResponse({ errorCode: "invalid_request" }); }
    const host = normalizeRequestHost(request.headers.get("host") ?? new URL(request.url).host);
    const origin = request.headers.get("origin");
    if (!host || (origin && new URL(origin).host !== (request.headers.get("host") ?? new URL(request.url).host)))
      return appointmentResponse({ errorCode: "not_found" });
    const sites = new PostgresSiteRepository({ boundary: "runtime" });
    const slug = input?.slug ?? raw.slug as string;
    const site = await sites.getPublicBySlug(slug);
    if (!site) return appointmentResponse({ errorCode: "not_found" });
    if (!configuredPlatformHosts().has(host)) {
      const domain = trustedCustomerDomainHost(host);
      const domainSite = domain ? await sites.getByVerifiedCustomDomain(domain) : null;
      if (!domainSite || domainSite.id !== site.id) return appointmentResponse({ errorCode: "not_found" });
    }
    const policy = abusePolicy.appointment;
    const attempt = await enforceSubjectRateLimit("appointment_site_network", site.id + ":" + clientAddress(request.headers),
      policy.siteNetwork.limit, policy.siteNetwork.windowSeconds, sites);
    if (!attempt.allowed) return NextResponse.json({ errorCode: "rate_limited" }, { status: 429,
      headers: { "retry-after": String(attempt.retryAfterSeconds ?? 60), "cache-control": "private, no-store" } });
    return appointmentResponse(receiptOnly ? await sites.getAppointmentReceipt(slug, site.id, key) :
      await sites.createDurableAppointment(site.id, input!, key, Object.fromEntries(
        (["starter", "professional", "premium"] as const).map(plan => [plan, tenantQuotas(plan, "appointment_submission")]))));
  } catch { return appointmentResponse({ errorCode: "temporarily_unavailable" }); }
}
export async function appointmentReceiptRateLimit(request: Request) {
  const policy = abusePolicy.appointment.network;
  return enforceRateLimit(request, "public-appointment", policy.limit, policy.windowSeconds);
}
