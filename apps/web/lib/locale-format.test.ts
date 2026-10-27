import { describe, expect, it } from "vitest";
import { formatCustomerCurrency, formatCustomerDateTime, formatCustomerNumber } from "./locale-format";

describe("customer locale formatting", () => {
  it("uses locale-specific dates, numbers and currency", () => {
    const date = "2026-08-24T13:30:00.000Z";
    expect(formatCustomerDateTime("en", date)).not.toBe(formatCustomerDateTime("de", date));
    expect(formatCustomerNumber("en", 1234.5)).not.toBe(formatCustomerNumber("de", 1234.5));
    expect(formatCustomerCurrency("de", 29, "EUR")).toContain("€");
  });
});
