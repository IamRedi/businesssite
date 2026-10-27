import { validAppointmentReceipt } from "./appointment-v1";

type Capability = { key: string; expiresAt: number };
const memory = new Map<string, Capability>();
const storageKey = (slug: string) => "appointment-receipt:v1:" + slug;
function persist(slug: string, value: Capability) {
  memory.set(slug, value);
  try { sessionStorage.setItem(storageKey(slug), JSON.stringify(value)); } catch { /* Memory-only fallback. */ }
}
function existing(slug: string): Capability | undefined {
  let value = memory.get(slug);
  if (!value) try {
    const parsed = JSON.parse(sessionStorage.getItem(storageKey(slug)) ?? "null");
    if (parsed && typeof parsed.key === "string" && (parsed.key === "" || /^[A-Za-z0-9_-]{43}$/.test(parsed.key)) && Number.isFinite(parsed.expiresAt))
      value = { key: parsed.key, expiresAt: parsed.expiresAt };
  } catch { /* Storage may be disabled. */ }
  return value;
}
export function clearAppointmentIntention(slug: string) {
  memory.delete(slug);
  try { sessionStorage.removeItem(storageKey(slug)); } catch { /* Memory-only fallback. */ }
}
export function appointmentClientCapability(slug: string) {
  const previous = existing(slug);
  if (previous) {
    if (previous.expiresAt <= Date.now() || !previous.key) {
      persist(slug, { key: "", expiresAt: previous.expiresAt });
      return null; // Expiry never creates a new intention. Explicit clear is required.
    }
    return previous;
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const value = { key, expiresAt: Date.now() + 86_400_000 };
  persist(slug, value);
  return value;
}
export async function submitAppointmentV1(formData: FormData, request: typeof fetch, signal: AbortSignal) {
  const slug = formData.get("slug");
  if (typeof slug !== "string" || !slug) return "error" as const;
  const capability = appointmentClientCapability(slug);
  if (!capability) return "error" as const;
  const response = await request("/api/public/appointments", { method: "POST", signal,
    headers: { "content-type": "application/json", "idempotency-key": capability.key },
    body: JSON.stringify({ ...Object.fromEntries(formData), contractVersion: 1 }) });
  if (response.status === 410) persist(slug, { key: "", expiresAt: Date.now() });
  if (response.status !== 201 && response.status !== 200) return "error" as const;
  const result: unknown = await response.json();
  if (!validAppointmentReceipt(result, response.status)) return "error" as const;
  persist(slug, { key: capability.key, expiresAt: Date.parse(result.receipt.expiresAt) });
  return "sent" as const;
}
export async function recoverAppointmentReceipt(slug: string, request: typeof fetch = fetch) {
  const capability = existing(slug);
  if (!capability || !capability.key || capability.expiresAt <= Date.now()) {
    if (capability) persist(slug, { key: "", expiresAt: capability.expiresAt });
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await request("/api/public/appointments/receipt", { method: "POST", signal: controller.signal,
      headers: { "content-type": "application/json", "idempotency-key": capability.key },
      body: JSON.stringify({ contractVersion: 1, slug }) });
    if (response.status === 410) persist(slug, { key: "", expiresAt: Date.now() });
    const result: unknown = await response.json();
    return response.status === 200 && validAppointmentReceipt(result, 200) ? result : null;
  } catch { return null; } finally { clearTimeout(timeout); }
}
