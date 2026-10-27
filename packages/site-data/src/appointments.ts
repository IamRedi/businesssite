import { createHash, createHmac } from "node:crypto";

export type AppointmentV1Input = {
  contractVersion: 1; slug: string; customerName: string; phone: string;
  email?: string; serviceId?: string; serviceTitle?: string;
  preferredDate?: string; preferredTime?: string; note?: string;
};
export type AppointmentReceipt = {
  ok: true;
  receipt: { appointmentId: string; createdAt: string; expiresAt: string };
  appointment: { status: "requested" | "confirmed" | "declined" | "cancelled"; version: number;
    serviceTitle: string | null; preferredDate: string | null; preferredTime: string | null };
  replayed: boolean;
  notification: { state: "disabled" };
};
export type AppointmentV1Result = AppointmentReceipt | {
  errorCode: "invalid_request" | "not_found" | "capability_disabled" | "idempotency_conflict" |
    "capability_expired" | "temporarily_unavailable" | "service_selection_required" | "quota_reached";
  retryAfterSeconds?: number;
};
export function appointmentFingerprintKeys(env: Record<string, string | undefined> = process.env) {
  const activeVersion = env.APPOINTMENT_FINGERPRINT_KEY_VERSION ?? "";
  let raw: unknown;
  try { raw = JSON.parse(env.APPOINTMENT_FINGERPRINT_KEYS ?? ""); }
  catch { throw new Error("appointment_key_config_invalid"); }
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(activeVersion) || !raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("appointment_key_config_invalid");
  const entries = Object.entries(raw);
  if (!entries.length || entries.length > 32) throw new Error("appointment_key_config_invalid");
  const keys = new Map<string, Buffer>();
  for (const [version, encoded] of entries) {
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(version) || typeof encoded !== "string") throw new Error("appointment_key_config_invalid");
    const key = Buffer.from(encoded, "base64url");
    if (key.length !== 32 || key.toString("base64url") !== encoded) throw new Error("appointment_key_config_invalid");
    keys.set(version, key);
  }
  if (!keys.has(activeVersion)) throw new Error("appointment_key_version_unavailable");
  return { activeVersion, keys };
}
export function appointmentReceiptDigest(capability: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(capability)) throw new Error("invalid_receipt_key");
  const bytes = Buffer.from(capability, "base64url");
  if (bytes.length !== 32 || bytes.toString("base64url") !== capability) throw new Error("invalid_receipt_key");
  return createHash("sha256").update(bytes).digest("hex");
}
export function appointmentFingerprints(siteId: string, input: AppointmentV1Input,
  config = appointmentFingerprintKeys()) {
  // Fixed tuple, normalized accepted fields only. Neither object order nor client authority participates.
  const canonical = JSON.stringify(["BSRC:appointment-fingerprint:v1", siteId, 1, input.slug,
    input.customerName, input.phone, input.email ?? null, input.serviceId ?? null,
    input.serviceTitle ?? null, input.preferredDate ?? null, input.preferredTime ?? null, input.note ?? null]);
  return Object.fromEntries([...config.keys].map(([version, key]) =>
    [version, createHmac("sha256", key).update(canonical).digest("hex")]));
}
