import { describe, expect, it } from "vitest";
import { clientAddress, rateLimitSubject } from "./rate-limit";

describe("rate limit identity handling", () => {
  it("normalizes and hashes subjects without retaining their raw value", () => {
    const first = rateLimitSubject(" Customer@Example.com ");
    expect(first).toBe(rateLimitSubject("customer@example.com"));
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("customer");
  });

  it("uses the first forwarded client address", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.4, 10.0.0.1" }))).toBe("203.0.113.4");
  });
});
