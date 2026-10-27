import { appointmentV1Http } from "../../../../lib/appointment-v1-http";
import { NextResponse } from "next/server";
import { PostgresSiteRepository } from "@platform/site-data";
import { clientAddress, enforceRateLimit, enforceSubjectRateLimit } from "../../../../lib/rate-limit";
import { enforceTenantQuota } from "../../../../lib/tenant-usage-policy";
import { readJsonBody } from "../../../../lib/request-body";
import { abusePolicy } from "../../../../lib/abuse-policy";
import { sendAppointmentRequestNotification } from "../../../../lib/email";
import { parseAppointmentRequest } from "../../../../lib/appointment-request";

export async function POST(request: Request) {
  try {
    const response = await handlePost(request);
    response.headers.set("cache-control", "private, no-store");
    return response;
  } catch {
    return NextResponse.json({ errorCode: "temporarily_unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } });
  }
}
async function handlePost(request: Request) {
  const policy = abusePolicy.appointment;
  const rateLimit = await enforceRateLimit(request, "public-appointment", policy.network.limit, policy.network.windowSeconds);
  if (!rateLimit.allowed)
    return NextResponse.json(
      { errorCode: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
    );
  const body = await readJsonBody<unknown>(request, 8 * 1024);
  if (!body.ok)
    return NextResponse.json({ errorCode: "invalid_request" }, { status: body.status });
  if (body.value && typeof body.value === "object" && "contractVersion" in body.value)
    return appointmentV1Http(request, body.value);
  const input = parseAppointmentRequest(body.value);
  if (!input)
    return NextResponse.json({ errorCode: "invalid_request" }, { status: 400 });
  if (input.website)
    return NextResponse.json({ ok: true }, { status: 201 });
  if (!input.slug || !input.customerName || !input.phone)
    return NextResponse.json(
      { errorCode: "invalid_request" },
      { status: 400 },
    );
  const sites = new PostgresSiteRepository({ boundary: "runtime" });
  const site = await sites.getPublicBySlug(input.slug);
  if (!site)
    return NextResponse.json({ errorCode: "not_found" }, { status: 404 });
  if (input.serviceTitle && !site.services.some((service) => service.title === input.serviceTitle))
    return NextResponse.json({ errorCode: "invalid_request" }, { status: 400 });
  const siteId = site.id;
  const address = clientAddress(request.headers);
  const siteNetworkLimit = await enforceSubjectRateLimit(
    "appointment_site_network",
    `${siteId}:${address}`,
    policy.siteNetwork.limit,
    policy.siteNetwork.windowSeconds,
    sites,
  );
  if (!siteNetworkLimit.allowed)
    return NextResponse.json(
      { errorCode: "rate_limited" },
      { status: 429, headers: { "retry-after": String(siteNetworkLimit.retryAfterSeconds) } },
    );
  const replayLimit = await enforceSubjectRateLimit(
    "appointment_replay",
    `${siteId}:${input.phone}:${input.preferredDate ?? ""}:${input.preferredTime ?? ""}:${input.serviceTitle ?? ""}`,
    policy.replay.limit,
    policy.replay.windowSeconds,
    sites,
  );
  if (!replayLimit.allowed)
    return NextResponse.json(
      { errorCode: "rate_limited" },
      { status: 429, headers: { "retry-after": String(replayLimit.retryAfterSeconds ?? policy.replay.windowSeconds) } },
    );
  const tenantQuota = await enforceTenantQuota(sites, {
    siteId,
    metric: "appointment_submission",
  });
  if (!tenantQuota.allowed)
    return NextResponse.json(
      {
        errorCode: "quota_reached",
        state: tenantQuota.state,
      },
      {
        status: 429,
        headers: {
          "retry-after": String(tenantQuota.retryAfterSeconds ?? 60),
        },
      },
    );
  let appointment;
  try {
    appointment = await sites.createPublicAppointmentBySlug(input.slug, {
      customerName: input.customerName.slice(0, 120),
      phone: input.phone.slice(0, 40),
      email: input.email?.slice(0, 160),
      serviceTitle: input.serviceTitle?.slice(0, 120),
      preferredDate: input.preferredDate,
      preferredTime: input.preferredTime,
      note: input.note?.slice(0, 1000),
    });
  } catch {
    return NextResponse.json({ errorCode: "appointment_unavailable" }, { status: 403 });
  }
  try {
    const account = await sites.getAdminBySiteId(appointment.siteId);
    if (account) {
      await sendAppointmentRequestNotification({
        to: account.email,
        businessName: site.content.name,
        customerName: input.customerName.slice(0, 120),
        phone: input.phone.slice(0, 40),
        email: input.email?.slice(0, 160),
        serviceTitle: input.serviceTitle?.slice(0, 120),
        preferredDate: input.preferredDate,
        preferredTime: input.preferredTime,
        locale: account.preferredLocale,
      });
    }
  } catch {
    // Recipient lookup and delivery happen after persistence. Neither may
    // turn a stored request into a failed submission. Durable retry remains separate.
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
