import { describe, expect, it } from "vitest";
import { landingCopy } from "./landing-copy";
import { configuredConversionLandingCopy, conversionLandingCopy } from "./conversion-landing-copy";

describe("landing localization", () => {
  it("provides a complete landing and trial flow for every supported locale", () => {
    for (const [locale, copy] of Object.entries(landingCopy)) {
      expect(copy.language, locale).toBeTruthy();
      expect(copy.nav.create, locale).toBeTruthy();
      expect(copy.hero.title, locale).toBeTruthy();
      expect(copy.wizard.create(14), locale).toBeTruthy();
      expect(copy.plan.title(14), locale).toBeTruthy();
      expect(Object.keys(copy.categories)).toHaveLength(20);
      expect(copy.categories["Medical practice"], locale).toBeTruthy();
      expect(copy.categories["Dental practice"], locale).toBeTruthy();
      expect(copy.categories["Home care"], locale).toBeTruthy();
      expect(copy.categories.Psychotherapy, locale).toBeTruthy();
    }
  });

  it("provides the complete conversion landing structure in every locale", () => {
    for (const [locale, copy] of Object.entries(conversionLandingCopy)) {
      expect(copy.hero.title, locale).toBeTruthy();
      expect(copy.hero.trust, locale).toHaveLength(3);
      expect(copy.comparison.rows, locale).toHaveLength(3);
      expect(copy.process.items, locale).toHaveLength(3);
      expect(copy.gallery.labels, locale).toHaveLength(6);
      expect(copy.gallery.sites, locale).toHaveLength(6);
      expect(copy.gallery.sites.every((site) => site.brand && site.title && site.cta), locale).toBe(true);
      expect(Object.keys(copy.evolve.planDescriptions), locale).toHaveLength(3);
      expect(copy.evolve.priceNote, locale).toMatch(/cancel|künd|résili|anul|annulla/i);
      expect(copy.evolve.offer, locale).toMatch(/2/);
      expect(copy.evolve.unavailable, locale).toBeTruthy();
      expect(copy.trial.title, locale).toBeTruthy();
    }
  });

  it("keeps the selected language in the demo intake instead of reverting to the platform default", () => {
    expect(landingCopy.sq.wizard.business).toBe("Emri i biznesit");
    expect(landingCopy.sq.steps.title).toBe("Nga ideja te një website që e zotëroni.");
    expect(landingCopy.de.wizard.category).toBe("Branche");
  });

  it("uses configured trial duration and request-only appointment language", () => {
    for (const locale of Object.keys(conversionLandingCopy) as Array<keyof typeof conversionLandingCopy>) {
      const copy = configuredConversionLandingCopy(locale, 21);
      expect(JSON.stringify({ hero: copy.hero, trial: copy.trial, priceNote: copy.evolve.priceNote }), locale).toContain("21");
      expect(JSON.stringify({ hero: copy.hero, trial: copy.trial, priceNote: copy.evolve.priceNote }), locale).not.toMatch(/\b14\b/);
      expect(copy.gallery.sites.slice(0, 3).map((site) => site.cta).join(" "), locale)
        .not.toMatch(/Book|Reserve|buchen|reservier|Rezervo|Réserver|Reservar|Prenota/i);
    }
  });
});
