import { getRuntimePostgresPool, withAuthenticatedSiteAdminContext } from "@platform/database";

export type BookingConfig = { enabled: boolean; timezone?: string; slotMinutes?: number; holdMinutes?: number };
export type BookingSlot = { startsAt: string; endsAt: string; localTime: string };
export type BookingAppointment = { id: string; name: string; phone: string; email: string | null; service: string;
  startsAt: string; status: "requested" | "proposed" | "accepted" | "confirmed" | "declined" | "cancelled"; holdExpiresAt: string | null;
  proposedStart: string | null; version: number };
export type BookingSnapshot = { settings: (BookingConfig & { version: number }) | null;
  weekly: Array<{ day: number; kind: "work" | "break"; start: string; end: string }>;
  blocks: Array<{ kind: "closed_day" | "manual"; start: string; end: string }>;
  appointments: BookingAppointment[] };
export type BookingResult = { ok: true; id?: string; status?: string; version?: number;
  startsAt?: string; phone?: string; name?: string } | { errorCode: string };

export async function publicBookingConfig(slug: string): Promise<BookingConfig> {
  const result = await getRuntimePostgresPool().query("select public.booking_public_config($1) value", [slug]);
  return result.rows[0]?.value ?? { enabled: false };
}

export async function publicBookingSlots(slug: string, day: string): Promise<BookingSlot[]> {
  const result = await getRuntimePostgresPool().query(
    "select starts_at,ends_at,local_time from public.booking_public_slots($1,$2::date)", [slug, day]);
  return result.rows.map(row => ({ startsAt: row.starts_at.toISOString(), endsAt: row.ends_at.toISOString(), localTime: row.local_time }));
}

export async function requestBooking(slug: string, start: string, service: string, name: string, phone: string, email: string): Promise<BookingResult> {
  const result = await getRuntimePostgresPool().query(
    "select public.booking_request($1,$2::timestamptz,$3,$4,$5,$6) value", [slug, start, service, name, phone, email]);
  return result.rows[0]?.value ?? { errorCode: "unavailable" };
}

export async function bookingAdminSnapshot(siteId: string, sessionHash: string): Promise<BookingSnapshot | null> {
  return withAuthenticatedSiteAdminContext(getRuntimePostgresPool(), sessionHash, async client => {
    const result = await client.query("select public.booking_admin_snapshot($1) value", [siteId]);
    return result.rows[0]?.value ?? null;
  }, { expectedSiteId: siteId });
}

export async function bookingAdminTransition(siteId: string, sessionHash: string, id: string,
  action: "confirm" | "decline" | "cancel" | "propose" | "accept_proposed", version: number, newStart?: string): Promise<BookingResult | null> {
  return withAuthenticatedSiteAdminContext(getRuntimePostgresPool(), sessionHash, async client => {
    const result = await client.query("select public.booking_transition($1,$2::uuid,$3,$4,$5::timestamptz) value",
      [siteId, id, action, version, newStart ?? null]);
    return result.rows[0]?.value ?? { errorCode: "unavailable" };
  }, { expectedSiteId: siteId });
}

export async function bookingAdminConfirmProposed(siteId: string, sessionHash: string, id: string, version: number): Promise<BookingResult | null> {
  return withAuthenticatedSiteAdminContext(getRuntimePostgresPool(), sessionHash, async client => {
    const result = await client.query("select public.booking_confirm_proposed($1,$2::uuid,$3) value", [siteId,id,version]);
    return result.rows[0]?.value ?? { errorCode: "unavailable" };
  }, { expectedSiteId: siteId });
}

export async function bookingAdminConfigure(siteId: string, sessionHash: string, input: {
  version: number; timezone: string; slotMinutes: number; enabled: boolean;
  weekly: BookingSnapshot["weekly"]; blocks: BookingSnapshot["blocks"];
}): Promise<BookingResult | null> {
  return withAuthenticatedSiteAdminContext(getRuntimePostgresPool(), sessionHash, async client => {
    const result = await client.query("select public.booking_configure($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7) value",
      [siteId,input.version,input.timezone,input.slotMinutes,JSON.stringify(input.weekly),JSON.stringify(input.blocks),input.enabled]);
    return result.rows[0]?.value ?? { errorCode: "unavailable" };
  }, { expectedSiteId: siteId });
}
