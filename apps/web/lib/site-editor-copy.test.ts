import { describe, expect, it } from "vitest";
import { designEditorCopy, formatSiteAdminDate, siteAdminPageCopy } from "./site-editor-copy";

const locales = ["de", "en", "fr", "es", "it", "sq"] as const;

describe("site admin translations", () => {
  it("provides complete page-level copy for every supported locale", () => {
    for (const locale of locales) {
      const copy = siteAdminPageCopy[locale];
      expect(copy.header.every(Boolean)).toBe(true);
      expect(Object.values(copy.appointments).every(Boolean)).toBe(true);
      expect(Object.values(copy.domain).every(Boolean)).toBe(true);
      expect(Object.values(copy.security).every(Boolean)).toBe(true);
      expect(copy.trial.trial(3)).toContain("3");
      expect(copy.trial.ends("DATE")).toContain("DATE");
      expect(Object.values(designEditorCopy[locale].presets).every((preset) => preset.name && preset.detail)).toBe(true);
    }
  });

  it("does not fall back to English for localized admin headings", () => {
    for (const locale of locales.filter((value) => value !== "en")) {
      expect(siteAdminPageCopy[locale].header[0]).not.toBe(siteAdminPageCopy.en.header[0]);
      expect(siteAdminPageCopy[locale].appointments.title).not.toBe(siteAdminPageCopy.en.appointments.title);
      expect(siteAdminPageCopy[locale].security.title).not.toBe(siteAdminPageCopy.en.security.title);
      expect(designEditorCopy[locale].presets.auto.detail).not.toBe(designEditorCopy.en.presets.auto.detail);
    }
  });

  it("formats dates with the selected website locale", () => {
    const date = new Date("2026-08-21T16:01:24Z");
    expect(formatSiteAdminDate("sq", date)).not.toBe(formatSiteAdminDate("en", date));
    expect(formatSiteAdminDate("de", date)).not.toBe(formatSiteAdminDate("en", date));
  });
});
