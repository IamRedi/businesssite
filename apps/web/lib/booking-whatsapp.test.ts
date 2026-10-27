import { describe, expect, it } from "vitest";
import { confirmedBookingWhatsApp, proposedBookingWhatsApp } from "./booking-whatsapp";

describe("confirmed booking WhatsApp composer", () => {
  it("encodes a German message using the business timezone", () => {
    const url = confirmedBookingWhatsApp({ phone: "+49 176 12345678", name: "Ada & Ben",
      startsAt: "2026-10-26T09:30:00.000Z", timezone: "Europe/Berlin", businessName: "Barbershop Beispielstadt" });
    expect(url?.startsWith("https://wa.me/4917612345678?text=")).toBe(true);
    expect(decodeURIComponent(url!.split("?text=")[1])).toBe("Hallo Ada & Ben, dein Termin am 26.10.2026 um 10:30 Uhr ist bestätigt. Bis bald – Barbershop Beispielstadt.");
  });
  it("refuses a phone that cannot form a WhatsApp link", () => {
    expect(confirmedBookingWhatsApp({ phone: "abc", name: "Ada", startsAt: "2026-10-26T09:30:00Z",
      timezone: "Europe/Berlin", businessName: "Studio" })).toBeNull();
  });
  it("opens a composer for a proposed time without claiming confirmation", () => {
    const url = proposedBookingWhatsApp({ phone: "+49 176 12345678", name: "Ada",
      startsAt: "2026-10-26T09:30:00.000Z", timezone: "Europe/Berlin", businessName: "Studio" });
    expect(url?.startsWith("https://wa.me/4917612345678?text=")).toBe(true);
    expect(decodeURIComponent(url!.split("?text=")[1])).toContain("passt dir stattdessen ein Termin am 26.10.2026 um 10:30 Uhr?");
  });
});
