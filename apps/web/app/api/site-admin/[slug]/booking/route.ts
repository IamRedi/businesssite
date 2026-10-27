import { NextResponse } from "next/server";
import { bookingAdminConfigure, bookingAdminSnapshot, bookingAdminTransition, bookingAdminConfirmProposed, PostgresSiteRepository } from "@platform/site-data";
import { requireSiteAdmin, trustedSiteAdminSessionHash } from "../../../../../lib/site-admin-auth";
import { isSameOriginRequest } from "../../../../../lib/same-origin";
import { readJsonBody } from "../../../../../lib/request-body";
import { confirmedBookingWhatsApp, proposedBookingWhatsApp } from "../../../../../lib/booking-whatsapp";

const headers = { "cache-control": "private, no-store" };
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    if (!isSameOriginRequest(request)) return NextResponse.json({ errorCode: "forbidden" }, { status: 403, headers });
    const { slug } = await context.params;
    const session = await requireSiteAdmin(slug);
    if (!session) return NextResponse.json({ errorCode: "forbidden" }, { status: 403, headers });
    const body = await readJsonBody<unknown>(request, 32 * 1024);
    if (!body.ok || !body.value || typeof body.value !== "object" || Array.isArray(body.value))
      return NextResponse.json({ errorCode: "invalid_request" }, { status: 400, headers });
    const value = body.value as Record<string, unknown>;
    const hash = trustedSiteAdminSessionHash(session);
    if (value.action === "configure") {
      if (!Number.isSafeInteger(value.version) || typeof value.timezone !== "string" || !Number.isSafeInteger(value.slotMinutes) ||
        typeof value.enabled !== "boolean" || !Array.isArray(value.weekly) || !Array.isArray(value.blocks))
        return NextResponse.json({ errorCode: "invalid_request" }, { status: 400, headers });
      const result = await bookingAdminConfigure(session.siteId,hash,value as Parameters<typeof bookingAdminConfigure>[2]);
      return NextResponse.json(result, { status: result && "ok" in result ? 200 : 409, headers });
    }
    if (!["confirm","confirm_proposed","decline","cancel","propose","accept_proposed"].includes(String(value.action)) ||
      typeof value.id !== "string" || !/^[0-9a-f-]{36}$/i.test(value.id) || !Number.isSafeInteger(value.version) ||
      (value.newStart !== undefined && (typeof value.newStart !== "string" || Number.isNaN(Date.parse(value.newStart)))))
      return NextResponse.json({ errorCode: "invalid_request" }, { status: 400, headers });
    const result = value.action === "confirm_proposed"
      ? await bookingAdminConfirmProposed(session.siteId,hash,value.id,value.version as number)
      : await bookingAdminTransition(session.siteId,hash,value.id,value.action as "confirm" | "decline" | "cancel" | "propose" | "accept_proposed",value.version as number,value.newStart as string | undefined);
    if (!result || "errorCode" in result) return NextResponse.json(result ?? { errorCode: "forbidden" }, { status: 409, headers });
    if (!["confirm","confirm_proposed","propose"].includes(String(value.action))) return NextResponse.json(result, { headers });
    const [snapshot,dashboard] = await Promise.all([
      bookingAdminSnapshot(session.siteId,hash),
      new PostgresSiteRepository({ boundary: "site_admin", sessionHash: hash }).getBusinessAdminDashboard(hash,slug),
    ]);
    const whatsappUrl = result.phone && result.name && snapshot?.settings?.timezone && dashboard?.site?.content.name
      ? value.action === "propose" && typeof value.newStart === "string"
        ? proposedBookingWhatsApp({ phone: result.phone, name: result.name, startsAt: value.newStart,
          timezone: snapshot.settings.timezone, businessName: dashboard.site.content.name })
        : result.startsAt ? confirmedBookingWhatsApp({ phone: result.phone, name: result.name, startsAt: result.startsAt,
          timezone: snapshot.settings.timezone, businessName: dashboard.site.content.name }) : null
      : null;
    return NextResponse.json({ ...result, whatsappUrl }, { headers });
  } catch { return NextResponse.json({ errorCode: "unavailable" }, { status: 503, headers }); }
}
