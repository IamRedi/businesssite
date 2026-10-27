import { describe, expect, it } from "vitest";
import {
  aiStudioCopy,
  businessWorkspaceCopy,
  formatOwnerDate,
  leadDetailCopy,
  translateLeadReason,
} from "./owner-workspace-copy";

const locales = ["de", "en", "fr", "es", "it", "sq"] as const;

describe("owner business workspace translations", () => {
  it("provides functional copy for every supported locale", () => {
    for (const locale of locales) {
      expect(businessWorkspaceCopy[locale].title).toBeTruthy();
      expect(businessWorkspaceCopy[locale].showing(1, 2, 3)).toContain("3");
      expect(leadDetailCopy[locale].scoreTitle).toBeTruthy();
      expect(leadDetailCopy[locale].daysIdentified(7)).toContain("7");
      expect(aiStudioCopy[locale].title).toBeTruthy();
      expect(aiStudioCopy[locale].researchSummary(2, 4, 1)).toContain("4");
    }
  });

  it("does not fall back to English for localized workspace headings", () => {
    for (const locale of locales.filter((value) => value !== "en")) {
      expect(businessWorkspaceCopy[locale].title).not.toBe(businessWorkspaceCopy.en.title);
      expect(leadDetailCopy[locale].scoreTitle).not.toBe(leadDetailCopy.en.scoreTitle);
      expect(aiStudioCopy[locale].title).not.toBe(aiStudioCopy.en.title);
    }
  });

  it("localizes canonical scoring reasons and owner dates", () => {
    expect(translateLeadReason("sq", "no website detected")).toBe("nuk u gjet website");
    expect(translateLeadReason("sq", "website quality has not been assessed")).toBe("cilësia e website-it nuk është vlerësuar ende");
    expect(translateLeadReason("de", "phone available for outreach")).not.toBe("phone available for outreach");
    expect(translateLeadReason("sq", "provider-specific reason")).toBe("provider-specific reason");
    expect(formatOwnerDate("sq", "2026-08-21T16:01:24Z")).not.toBe(formatOwnerDate("en", "2026-08-21T16:01:24Z"));
  });
});
