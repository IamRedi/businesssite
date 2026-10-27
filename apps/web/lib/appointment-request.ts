import { submitAppointmentV1 } from "./appointment-v1-client";

export type AppointmentRequestInput = {
  slug: string;
  customerName: string;
  phone: string;
  website?: string;
  email?: string;
  serviceTitle?: string;
  preferredDate?: string;
  preferredTime?: string;
  note?: string;
};

// This is a preferred-time request, not an availability or booking decision.
export function parseAppointmentRequest(value: unknown): AppointmentRequestInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.website === "string" && raw.website.trim()) {
    return { slug: "", customerName: "", phone: "", website: raw.website.trim() };
  }
  const limits = { slug: 200, customerName: 120, phone: 40, email: 160, serviceTitle: 120, preferredDate: 10, preferredTime: 8, note: 1000 };
  const fields: Record<string, string> = {};
  for (const [key, limit] of Object.entries(limits)) {
    const field = raw[key];
    if (field === undefined) continue;
    if (typeof field !== "string" || field.length > limit) return null;
    if (field.trim()) fields[key] = field.trim();
  }
  if (!fields.slug || !fields.customerName || !fields.phone) return null;
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) return null;
  if (fields.preferredDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.preferredDate)) return null;
    const date = new Date(`${fields.preferredDate}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== fields.preferredDate) return null;
  }
  if (fields.preferredTime && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(fields.preferredTime)) return null;
  return { ...fields, slug: fields.slug, customerName: fields.customerName, phone: fields.phone };
}

export async function submitAppointmentRequest(
  formData: FormData,
  request: typeof fetch = fetch,
): Promise<"sent" | "error"> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    if (formData.get("contractVersion") === "1") return await submitAppointmentV1(formData, request, controller.signal);
    const response = await request("/api/public/appointments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData)),
      signal: controller.signal,
    });
    if (response.status !== 201) return "error";
    const result: unknown = await response.json();
    return result !== null && typeof result === "object" && "ok" in result && result.ok === true
      ? "sent" : "error";
  } catch {
    return "error";
  } finally {
    clearTimeout(timeout);
  }
}
