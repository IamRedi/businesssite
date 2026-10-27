import { describe, expect, it } from "vitest";
import { subscriptionEntitlementsFor } from "../src/index";

describe("subscription entitlements", () => {
  it.each(["starter", "professional", "premium"] as const)(
    "includes a custom domain in the %s plan",
    (plan) => {
      expect(subscriptionEntitlementsFor(plan)).toMatchObject({
        website: true,
        custom_domain: true,
      });
    },
  );

  it("includes request-only appointments in Starter and reserves the real calendar", () => {
    const starter = subscriptionEntitlementsFor("starter");
    expect(starter.appointment_requests).toBe(true);
    expect(starter.booking).toBe(true);
    expect(starter.booking_calendar).toBe(false);
  });

  it("includes every current customer mutation capability in Starter", () => {
    expect(subscriptionEntitlementsFor("starter")).toMatchObject({
      website: true,
      editor: true,
      media: true,
      ai_rewrite: true,
      appointment_requests: true,
      custom_domain_existing: true,
      social_media: false,
    });
  });
});
