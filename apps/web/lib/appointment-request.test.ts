import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAppointmentRequest, submitAppointmentRequest } from "./appointment-request";

const valid = { slug: "synthetic-studio", customerName: "Synthetic Visitor", phone: "+49 000 000", preferredDate: "2028-02-29", preferredTime: "09:30" };

describe("appointment request validation", () => {
  it.each([null, [], true, 42, "request", {}, { ...valid, customerName: "   " }, { ...valid, phone: 123 }, { ...valid, email: "invalid" }, { ...valid, note: {} }, { ...valid, note: "x".repeat(1001) }, { ...valid, preferredDate: "2027-02-29" }, { ...valid, preferredDate: "2028-13-01" }, { ...valid, preferredTime: "24:00" }, { ...valid, preferredTime: "12:60" }])("rejects invalid input %#", (input) => {
    expect(parseAppointmentRequest(input)).toBeNull();
  });

  it("normalizes contact whitespace without accepting caller-controlled authority", () => {
    expect(parseAppointmentRequest({ ...valid, customerName: " Synthetic Visitor ", siteId: "another-tenant", status: "confirmed", email: "" })).toEqual(valid);
  });

  it("preserves optional preferred-time request fields and the honeypot", () => {
    expect(parseAppointmentRequest({ slug: valid.slug, customerName: valid.customerName, phone: valid.phone })).not.toBeNull();
    expect(parseAppointmentRequest({ website: "bot.example" })?.website).toBe("bot.example");
  });
});

describe("appointment form transport", () => {
  afterEach(() => vi.useRealTimers());

  it("reports sent only for a persisted-request acknowledgement", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true }, { status: 201 }));
    expect(await submitAppointmentRequest(new FormData(), request)).toBe("sent");
    expect(request).toHaveBeenCalledWith("/api/public/appointments", expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }));
  });

  it.each([429, 403, 500, 200])("does not treat HTTP %i as successful submission", async (status) => {
    expect(await submitAppointmentRequest(new FormData(), vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true }, { status })))).toBe("error");
  });

  it("recovers from network errors and malformed acknowledgements without automatic retry", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("synthetic network failure"));
    expect(await submitAppointmentRequest(new FormData(), request)).toBe("error");
    expect(request).toHaveBeenCalledTimes(1);
    expect(await submitAppointmentRequest(new FormData(), vi.fn<typeof fetch>().mockResolvedValue(new Response("not json", { status: 201 })))).toBe("error");
    expect(await submitAppointmentRequest(new FormData(), vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: false }, { status: 201 })))).toBe("error");
  });

  it("aborts a stalled request and releases the sending state", async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("synthetic abort")), { once: true });
    }));
    const pending = submitAppointmentRequest(new FormData(), request);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toBe("error");
    expect(vi.getTimerCount()).toBe(0);
  });
});
