import type { AppointmentV1Input, AppointmentReceipt } from "@platform/site-data";
import { parseAppointmentRequest } from "./appointment-request";

export function parseAppointmentV1(value: unknown): AppointmentV1Input | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const allowed = new Set(["contractVersion", "slug", "customerName", "phone", "email", "serviceId", "serviceTitle", "preferredDate", "preferredTime", "note", "website"]);
  if (raw.contractVersion !== 1 || Object.keys(raw).some(key => !allowed.has(key)) ||
      (raw.website !== undefined && (typeof raw.website !== "string" || raw.website.trim() !== ""))) return null;
  const normalized = parseAppointmentRequest(raw);
  if (!normalized || Boolean(normalized.preferredDate) !== Boolean(normalized.preferredTime)) return null;
  if (raw.serviceId !== undefined && (typeof raw.serviceId !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(raw.serviceId))) return null;
  if (raw.serviceId && normalized.serviceTitle) return null;
  if (normalized.preferredTime?.length === 5) normalized.preferredTime += ":00";
  return { ...normalized, contractVersion: 1, ...(raw.serviceId ? { serviceId: raw.serviceId as string } : {}) };
}
export function validAppointmentReceipt(value: unknown, status: number): value is AppointmentReceipt {
  if (!value || typeof value !== "object" || (status !== 200 && status !== 201)) return false;
  const v = value as Partial<AppointmentReceipt>;
  const r = v.receipt, a = v.appointment;
  if (v.ok !== true || v.replayed !== (status === 200) || !r || !a || v.notification?.state !== "disabled") return false;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(r.appointmentId) ||
    !Number.isFinite(Date.parse(r.createdAt)) || !Number.isFinite(Date.parse(r.expiresAt)) ||
    Date.parse(r.expiresAt) - Date.parse(r.createdAt) !== 86_400_000 ||
    !["requested", "confirmed", "declined", "cancelled"].includes(a.status) || !Number.isSafeInteger(a.version) || a.version < 1) return false;
  if (status === 201 && (a.status !== "requested" || a.version !== 1)) return false;
  return [a.serviceTitle, a.preferredDate, a.preferredTime].every(field => field === null || typeof field === "string");
}
