import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAppointmentV1, validAppointmentReceipt } from "./appointment-v1";
import { appointmentClientCapability, clearAppointmentIntention, recoverAppointmentReceipt } from "./appointment-v1-client";
import { submitAppointmentRequest } from "./appointment-request";
const input = { contractVersion: 1, slug: "synthetic-a", customerName: " Synthetic Visitor ", phone: "123", preferredDate: "2028-02-29", preferredTime: "09:30" };
const result = (replayed = false) => ({ ok: true, receipt: { appointmentId: "71000000-0000-4000-8000-000000000001", createdAt: "2026-09-13T12:00:00Z", expiresAt: "2026-09-14T12:00:00Z" },
  appointment: { status: "requested", version: 1, serviceTitle: null, preferredDate: null, preferredTime: null }, replayed, notification: { state: "disabled" } });
afterEach(() => { clearAppointmentIntention("synthetic-a"); clearAppointmentIntention("synthetic-b"); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("appointment v1 validation and transport", () => {
  it("normalizes paired civil times and rejects authority, notes shapes, honeypots and invalid versions", () => {
    expect(parseAppointmentV1(input)).toMatchObject({ customerName: "Synthetic Visitor", preferredTime: "09:30:00" });
    for (const value of [{ ...input, contractVersion: 2 }, { ...input, siteId: "other" }, { ...input, status: "confirmed" },
      { ...input, preferredDate: "" }, { ...input, preferredTime: "" }, { ...input, serviceId: "foreign", serviceTitle: "A" },
      { ...input, website: "bot" }, { ...input, note: {} }, { ...input, preferredDate: "2027-02-29" }])
      expect(parseAppointmentV1(value)).toBeNull();
  });
  it("validates first/replay schema instead of trusting arbitrary 2xx", () => {
    expect(validAppointmentReceipt(result(), 201)).toBe(true);
    expect(validAppointmentReceipt(result(true), 200)).toBe(true);
    for (const [value, status] of [[{ ok: true },200], [result(),200], [result(true),201], [result(),202],
      [{ ...result(), notification: { state: "delivered" } },201], [{ ...result(), receipt: {} },201]])
      expect(validAppointmentReceipt(value, status as number)).toBe(false);
  });
  it("keeps a per-site key after a lost response, accepts 200 replay and stores no form data", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
    const storage = new Map<string,string>();
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string,v: string) => storage.set(k,v), removeItem: (k: string) => storage.delete(k) });
    const form = new FormData(); for (const [k,v] of Object.entries(input)) form.set(k,String(v));
    const request = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("synthetic lost response"))
      .mockResolvedValueOnce(Response.json(result(true), { status: 200 }));
    expect(await submitAppointmentRequest(form, request)).toBe("error");
    expect(await submitAppointmentRequest(form, request)).toBe("sent");
    const keys = request.mock.calls.map(([,init]) => new Headers(init?.headers).get("idempotency-key"));
    expect(keys[0]).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(keys[1]).toBe(keys[0]);
    expect(appointmentClientCapability("synthetic-b")?.key).not.toBe(keys[0]);
    expect([...storage.values()].every(value => Object.keys(JSON.parse(value)).sort().join() === "expiresAt,key")).toBe(true);
    expect(JSON.stringify([...storage.values()])).not.toContain("Synthetic Visitor");
  });
  it("known expiry never rotates or sends another creation", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
    appointmentClientCapability("synthetic-a");
    vi.setSystemTime(new Date("2026-09-14T12:00:01Z"));
    expect(appointmentClientCapability("synthetic-a")).toBeNull();
    const request = vi.fn<typeof fetch>();
    expect(await recoverAppointmentReceipt("synthetic-a", request)).toBeNull();
    expect(request).not.toHaveBeenCalled();
    clearAppointmentIntention("synthetic-a");
    expect(appointmentClientCapability("synthetic-a")?.key).toHaveLength(43);
  });
  it("recovers only by bounded POST with a header capability", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
    appointmentClientCapability("synthetic-a");
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(result(true)));
    expect(await recoverAppointmentReceipt("synthetic-a",request)).toEqual(result(true));
    expect(request).toHaveBeenCalledWith("/api/public/appointments/receipt",expect.objectContaining({ method: "POST", body: JSON.stringify({ contractVersion: 1, slug: "synthetic-a" }) }));
  });
});
