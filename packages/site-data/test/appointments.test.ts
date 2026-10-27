import { describe, expect, it } from "vitest";
import { appointmentFingerprintKeys, appointmentFingerprints, appointmentReceiptDigest, type AppointmentV1Input } from "../src/appointments";
const synthetic = Buffer.alloc(32, 71).toString("base64url");
const input: AppointmentV1Input = { contractVersion: 1, slug: "synthetic-a", customerName: "Synthetic Visitor", phone: "+49 000 000" };
const config = (version = "v1") => appointmentFingerprintKeys({ APPOINTMENT_FINGERPRINT_KEY_VERSION: version,
  APPOINTMENT_FINGERPRINT_KEYS: JSON.stringify({ v1: synthetic, v2: Buffer.alloc(32, 72).toString("base64url") }) });
describe("appointment fingerprint keys", () => {
  it("hashes canonical 32-byte receipts and rejects aliases or weak shapes", () => {
    expect(appointmentReceiptDigest(synthetic)).toMatch(/^[a-f0-9]{64}$/);
    for (const key of ["short", synthetic + "=", synthetic.slice(0,-1) + "_"])
      expect(() => appointmentReceiptDigest(key)).toThrow("invalid_receipt_key");
  });
  it.each([{}, { APPOINTMENT_FINGERPRINT_KEYS: "{}", APPOINTMENT_FINGERPRINT_KEY_VERSION: "v1" },
    { APPOINTMENT_FINGERPRINT_KEYS: '{"v1":"short"}', APPOINTMENT_FINGERPRINT_KEY_VERSION: "v1" },
    { APPOINTMENT_FINGERPRINT_KEYS: "[]", APPOINTMENT_FINGERPRINT_KEY_VERSION: "v1" },
    { APPOINTMENT_FINGERPRINT_KEYS: JSON.stringify({ v1: synthetic + "=" }), APPOINTMENT_FINGERPRINT_KEY_VERSION: "v1" }])("fails closed without usable dedicated configuration %#", env => {
    expect(() => appointmentFingerprintKeys(env)).toThrow(/appointment_key_/);
  });
  it("rotation preserves the fingerprint under the stored version", () => {
    const before = appointmentFingerprints("site-a", input, config());
    const after = appointmentFingerprints("site-a", input, config("v2"));
    expect(after.v1).toBe(before.v1);
    expect(after.v2).not.toBe(after.v1);
  });
  it("binds normalized payload, version and tenant, independent of object order", () => {
    const a = appointmentFingerprints("site-a", input, config());
    expect(appointmentFingerprints("site-a", { phone: input.phone, ...input }, config())).toEqual(a);
    expect(appointmentFingerprints("site-b", input, config()).v1).not.toBe(a.v1);
    expect(appointmentFingerprints("site-a", { ...input, phone: "different" }, config()).v1).not.toBe(a.v1);
    expect(JSON.stringify(a)).not.toContain(input.customerName);
  });
});
