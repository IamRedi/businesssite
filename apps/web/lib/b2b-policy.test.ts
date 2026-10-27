import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { b2bLaunchCopy } from "./b2b-policy";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("B2B launch presentation", () => {
  it("places the explicit restriction on landing/pricing, trial and checkout", () => {
    expect(source("app/page.tsx")).toContain("b2b.restriction");
    expect(source("components/website-trial-wizard.tsx")).toContain("b2b.businessUse");
    expect(source("components/subscribe-form.tsx")).toContain("b2bCopy.restriction");
    expect(source("components/subscribe-form.tsx")).toContain("b2bCopy.businessUse");
    expect(b2bLaunchCopy("en").restriction).toBe("For businesses and self-employed professionals only.");
    expect(b2bLaunchCopy("de").restriction).toBe("Nur für Unternehmen und selbständig beruflich Tätige.");
  });

  it("keeps privacy acknowledgement distinct from consent and consumer withdrawal", () => {
    expect(b2bLaunchCopy("en").privacy).toContain("not general consent");
    expect(b2bLaunchCopy("de").privacy).toContain("keine allgemeine Einwilligung");
    const checkoutAndCancellation = source("components/subscribe-form.tsx") + source("app/legal/cancellation/page.tsx");
    expect(checkoutAndCancellation).not.toMatch(/Widerruf|14-day withdrawal|14 Tage/i);
    expect(checkoutAndCancellation).toContain("renewalAcknowledged");
  });

  it("keeps the Stripe clock acceptance fixture aligned with trial policy", () => {
    const acceptance = source("../../scripts/stripe-clock-acceptance.mjs");
    expect(acceptance).toContain("b2bAttested: true");
    expect(acceptance).toContain("privacyAcknowledged: true");
    expect(acceptance).toContain('"x-vercel-protection-bypass"');
  });
});
