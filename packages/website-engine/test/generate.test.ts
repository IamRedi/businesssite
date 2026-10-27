import { describe, expect, it } from "vitest";
import {
  generateSiteDocument,
  hasAlbanianSpecialistAbout,
  businessTemplates,
  customerPublicLegalIdentityComplete,
  customerPublicLegalIdentityMissingFields,
  professionalAboutCopy,
  resolveLocale,
  siteCopy,
  supportedLocales,
  type PreparedBusinessProfile,
} from "../src/index";

const profile: PreparedBusinessProfile = {
  id: "profile-1",
  version: 1,
  sourceLeadId: "lead-1",
  locale: "en",
  preparedAt: "2026-01-01T00:00:00Z",
  approvedSources: ["https://example.com"],
  business: {
    name: "Atelier Nova",
    category: "beauty salon",
    email: "hello@example.com",
  },
  services: [{ title: "Consultation" }],
};

describe("generateSiteDocument", () => {
  it("keeps an Albanian specialist about fallback for every business template", () => {
    expect(businessTemplates.every((template) => hasAlbanianSpecialistAbout(template.key))).toBe(true);
  });

  it("turns a prepared profile into a private, category-matched site", () => {
    const site = generateSiteDocument(profile);
    expect(site.visibility).toBe("private");
    expect(site.template).toBe("studio");
    expect(site.templateKey).toBe("beauty-studio");
    expect(site.media.heroImageUrl).toContain("beauty-studio");
    expect(site.slug).toBe("atelier-nova");
    expect(site.themeKey).toBe("gold");
    expect(site.contact.openingHours).toEqual([]);
    // The platform privacy page is generated automatically; the remaining
    // legal identity fields still gate publication.
    expect(site.publicLegal).toEqual({ privacyNoticePath: "/privacy" });
    expect(customerPublicLegalIdentityComplete(site)).toBe(false);
    expect(customerPublicLegalIdentityMissingFields(site)).not.toContain("privacyNoticeUrl");
  });

  it("requires a customer-owned legal identity and privacy URL for public release", () => {
    const site = generateSiteDocument(profile);
    site.publicLegal = {
      legalBusinessName: "Atelier Nova",
      street: "Example Street 1",
      postalCode: "45127",
      city: "Essen",
      countryCode: "DE",
      contactEmail: "legal@example.test",
      privacyNoticeUrl: "https://customer.example/privacy",
    };
    expect(customerPublicLegalIdentityComplete(site)).toBe(true);
    site.publicLegal.privacyNoticeUrl = "javascript:alert(1)";
    expect(customerPublicLegalIdentityComplete(site)).toBe(false);
  });

  it("names exactly the missing legal identity fields in canonical order", () => {
    const site = generateSiteDocument(profile);
    // The automatic privacy page already satisfies the privacy requirement.
    expect(customerPublicLegalIdentityMissingFields(site)).toEqual([
      "legalBusinessName", "street", "postalCode", "city", "countryCode", "contactEmail",
    ]);
    site.publicLegal = {
      legalBusinessName: "Atelier Nova",
      street: "Example Street 1",
      postalCode: "45127",
      city: "Essen",
      countryCode: "de",
      contactEmail: "not-an-email",
      privacyNoticeUrl: "http://customer.example/privacy",
    };
    expect(customerPublicLegalIdentityMissingFields(site)).toEqual(["countryCode", "contactEmail", "privacyNoticeUrl"]);
    site.publicLegal.countryCode = "DE";
    site.publicLegal.contactEmail = "legal@example.test";
    site.publicLegal.privacyNoticeUrl = "/privacy";
    expect(customerPublicLegalIdentityMissingFields(site)).toEqual([]);
  });

  it("treats the platform privacy page as valid and an external URL as an override", () => {
    const site = generateSiteDocument(profile);
    site.publicLegal = {
      legalBusinessName: "Atelier Nova", street: "Example Street 1", postalCode: "45127",
      city: "Essen", countryCode: "DE", contactEmail: "legal@example.test",
      privacyNoticePath: "/privacy",
    };
    expect(customerPublicLegalIdentityMissingFields(site)).toEqual([]);
    site.publicLegal.privacyNoticePath = undefined;
    site.publicLegal.privacyNoticeUrl = "https://customer.example/privacy";
    expect(customerPublicLegalIdentityMissingFields(site)).toEqual([]);
    site.publicLegal.privacyNoticeUrl = "http://insecure.example/privacy";
    expect(customerPublicLegalIdentityMissingFields(site)).toEqual(["privacyNoticeUrl"]);
  });

  it("uses up to six source-selected service images when a prepared profile provides them", () => {
    const sourceImages = [1, 2, 3, 4, 5, 6].map((index) => `https://business.example/work-${index}.jpg`);
    const site = generateSiteDocument({
      ...profile,
      services: sourceImages.map((_, index) => ({ title: `Verified service ${index + 1}` })),
      media: { serviceImageUrls: sourceImages, galleryImageUrls: sourceImages },
    });
    expect(site.services).toHaveLength(6);
    expect(site.media.serviceImageUrls).toEqual(sourceImages);
    expect(site.media.galleryImageUrls).toEqual(sourceImages);
  });

  it("uses a coherent hair-specific media set without repeating the hero", () => {
    const site = generateSiteDocument({
      ...profile,
      business: { name: "Maison Aurelia", category: "hair salon" },
    });
    expect(site.templateKey).toBe("hair-salon");
    expect(site.media.serviceImageUrls).toEqual([
      "/images/templates/wl-hair-editorial-v1.png",
      "/images/templates/wl-hair-lumen-v1.png",
      "/images/templates/wl-hair-noir-v1.png",
    ]);
    expect(site.media.serviceImageUrls).not.toContain(site.media.heroImageUrl);
    expect(site.media.galleryImageUrls).toEqual(site.media.serviceImageUrls);
  });

  it("keeps barber services on an exclusively barber-specific media pack", () => {
    const site = generateSiteDocument({
      ...profile,
      business: { name: "Arthur's Barber Club", category: "Herrenfriseur" },
      services: [{ title: "Men's haircut" }, { title: "Beard trim" }, { title: "Hot-towel shave" }],
    });
    expect(site.templateKey).toBe("barber");
    expect(site.media.serviceImageUrls).toEqual([
      "/images/templates/wl-barber-haircut-v1.webp",
      "/images/templates/wl-barber-beard-v1.webp",
      "/images/templates/wl-barber-hot-towel-v1.webp",
    ]);
    expect(site.media.serviceImageUrls.every((asset) => asset.includes("wl-barber-"))).toBe(true);
  });

  it.each([
    ["Nagelstudio", "nail-studio", "wl-nail-studio-", ["Professional manicure", "Bespoke nail design", "Pedicure care"]],
    ["Wimpernstudio", "lashes-brows", "wl-lashes-brows-", ["Lash extensions", "Brow shaping", "Lash lift and tint"]],
    ["Sallon bukurie", "beauty-studio", "wl-beauty-studio-", ["Signature facial", "Skin consultation", "Finishing care ritual"]],
  ])("keeps the exact beauty media and starter content for %s", (category, templateKey, mediaPrefix, expectedServices) => {
    const site = generateSiteDocument({ ...profile, business: { name: "Studio Aurelia", category }, services: [] });
    expect(site.templateKey).toBe(templateKey);
    expect(site.media.serviceImageUrls.every((asset) => asset.includes(mediaPrefix))).toBe(true);
    expect(site.media.serviceImageUrls).not.toContain(site.media.heroImageUrl);
    expect(site.services.map((service) => service.title)).toEqual(expectedServices);
  });

  it.each([
    ["Physiotherapie", "physiotherapy", "wl-physiotherapy-", ["Movement assessment", "Manual therapy", "Guided rehabilitation"]],
    ["Osteopathie", "osteopathy", "wl-osteopathy-", ["Osteopathic consultation", "Hands-on treatment", "Mobility guidance"]],
    ["Massagestudio", "massage", "wl-massage-", ["Relaxation massage", "Focused massage", "Sports massage"]],
    ["Ernährungsberatung", "nutrition", "wl-nutrition-", ["Nutrition consultation", "Personal meal planning", "Follow-up coaching"]],
    ["Wellnessstudio", "wellness", "wl-wellness-", ["Restorative movement", "Wellness ritual", "Guided relaxation"]],
  ])("keeps the exact wellness media and starter content for %s", (category, templateKey, mediaPrefix, expectedServices) => {
    const site = generateSiteDocument({ ...profile, business: { name: "Praxis Balance", category }, services: [] });
    expect(site.templateKey).toBe(templateKey);
    expect(site.media.serviceImageUrls.every((asset) => asset.includes(mediaPrefix))).toBe(true);
    expect(site.media.serviceImageUrls).not.toContain(site.media.heroImageUrl);
    expect(site.services.map((service) => service.title)).toEqual(expectedServices);
  });

  it("generates a physiotherapy site without psychotherapy media or copy", () => {
    const site = generateSiteDocument({
      ...profile,
      business: {
        name: "Physio Kitchen",
        category: "Physiotherapy practice",
      },
      services: [],
    });
    const serializedSite = JSON.stringify(site).toLocaleLowerCase();

    expect(site.templateKey).toBe("physiotherapy");
    expect(site.media.serviceImageUrls).toEqual([
      "/images/templates/wl-physiotherapy-assessment-v1.webp",
      "/images/templates/wl-physiotherapy-manual-therapy-v1.webp",
      "/images/templates/wl-physiotherapy-rehabilitation-v1.webp",
    ]);
    expect(serializedSite).not.toContain("psychotherap");
    expect(serializedSite).not.toContain("wl-therapy-practice");
  });

  it.each([
    ["Kanzlei", "lawyer", "wl-lawyer-", ["Initial legal consultation", "Document review", "Case strategy"]],
    ["Steuerberater", "accountant", "wl-accountant-", ["Financial review", "Tax preparation", "Business planning"]],
    ["Versicherungsagentur", "insurance", "wl-insurance-", ["Coverage consultation", "Risk review", "Claims support"]],
    ["ArchitekturbÃ¼ro", "architect", "wl-architect-", ["Initial project consultation", "Design planning", "Site coordination"]],
    ["Unternehmensberatung", "consultant", "wl-consultant-", ["Strategy workshop", "Business analysis", "Team alignment"]],
    ["Beratung", "consultation", "wl-consultation-", ["Initial consultation", "Solution planning", "Ongoing guidance"]],
  ])("keeps the exact professional media and starter content for %s", (category, templateKey, mediaPrefix, expectedServices) => {
    const site = generateSiteDocument({ ...profile, business: { name: "Professional Studio", category }, services: [] });
    expect(site.templateKey).toBe(templateKey);
    expect(site.media.serviceImageUrls.every((asset) => asset.includes(mediaPrefix))).toBe(true);
    expect(site.media.serviceImageUrls).not.toContain(site.media.heroImageUrl);
    expect(site.services.map((service) => service.title)).toEqual(expectedServices);
  });

  it.each([
    ["Restaurant", "restaurant", "wl-restaurant-"],
    ["Fast food", "fast-food", "wl-fast-food-"],
  ])("selects a dedicated food template and media pack for %s", (category, templateKey, mediaPrefix) => {
    const site = generateSiteDocument({ ...profile, business: { name: "Local Kitchen", category }, services: [] });
    expect(site.templateKey).toBe(templateKey);
    expect(site.media.heroImageUrl).toContain(mediaPrefix);
    expect(site.media.serviceImageUrls.every((asset) => asset.includes(mediaPrefix))).toBe(true);
    expect(site.media.serviceImageUrls).not.toContain(site.media.heroImageUrl);
  });

  it.each([
    ["Window cleaning", "window-cleaning", "wl-cleaning-"],
    ["Office cleaning", "office-cleaning", "wl-cleaning-"],
    ["Facility management", "facility-cleaning", "wl-cleaning-"],
    ["House cleaning", "home-cleaning", "wl-cleaning-"],
    ["Courier", "courier", "wl-logistics-"],
    ["Local delivery", "local-delivery", "wl-logistics-"],
    ["Moving company", "moving", "wl-moving-"],
  ])("uses an approved shared or exclusive media pack for %s", (category, templateKey, mediaPrefix) => {
    const site = generateSiteDocument({ ...profile, business: { name: "Reliable Service", category }, services: [] });
    expect(site.templateKey).toBe(templateKey);
    expect(site.media.serviceImageUrls.every((asset) => asset.includes(mediaPrefix))).toBe(true);
    expect(site.media.serviceImageUrls).not.toContain(site.media.heroImageUrl);
  });

  it.each([
    ["Tierarzt", "veterinary", "wl-veterinary-", ["Veterinary consultation", "Gentle assessment", "Preventive care guidance"]],
    ["Hundesalon", "pet-grooming", "wl-pet-grooming-", ["Gentle bath and care", "Coat grooming", "Calm finishing service"]],
    ["Hundeschule", "dog-training", "wl-dog-training-", ["Training assessment", "Everyday obedience", "Owner guidance"]],
    ["Tierwellness", "pet-wellness", "wl-pet-wellness-", ["Comfort-focused care", "Gentle movement support", "Relaxed wellbeing time"]],
  ])("keeps the exact pet media and starter content for %s", (category, templateKey, mediaPrefix, expectedServices) => {
    const site = generateSiteDocument({ ...profile, business: { name: "Happy Pet", category }, services: [] });
    expect(site.templateKey).toBe(templateKey);
    expect(site.media.serviceImageUrls.every((asset) => asset.includes(mediaPrefix))).toBe(true);
    expect(site.media.serviceImageUrls).not.toContain(site.media.heroImageUrl);
    expect(site.services.map((service) => service.title)).toEqual(expectedServices);
  });

  it.each([
    ["Kfz-Werkstatt", "auto-repair", "wl-auto-repair-"],
    ["Servis makinash", "auto-repair", "wl-auto-repair-"],
    ["Autohaus", "car-dealership", "wl-car-dealership-"],
    ["Sallon makinash", "car-dealership", "wl-car-dealership-"],
  ])("selects an exact vehicle-business template and exclusive media pack for %s", (category, templateKey, mediaPrefix) => {
    const site = generateSiteDocument({ ...profile, business: { name: "Motorhaus", category }, services: [] });
    expect(site.templateKey).toBe(templateKey);
    expect(site.media.heroImageUrl).toContain(mediaPrefix);
    expect(site.media.serviceImageUrls.every((asset) => asset.includes(mediaPrefix))).toBe(true);
    expect(site.media.serviceImageUrls).not.toContain(site.media.heroImageUrl);
    expect(site.services.map((service) => service.title)).toEqual(
      templateKey === "auto-repair"
        ? ["Vehicle diagnostics", "Maintenance and repairs", "Brakes and tyres"]
        : ["Vehicle selection", "Test drive", "Purchase and handover"],
    );
  });

  it("selects the tree-service visual for a finder lead", () => {
    const site = generateSiteDocument({
      ...profile,
      business: { name: "Baumdienst Essen", category: "Services" },
    });
    expect(site.templateKey).toBe("tree-service");
    expect(site.media.heroImageUrl).toContain("garden-tree-service");
    expect(site.media.serviceImageUrls).toEqual([
      "/images/templates/wl-tree-inspection-v1.webp",
      "/images/templates/wl-tree-pruning-v1.webp",
      "/images/templates/wl-tree-clearance-v1.webp",
    ]);
    expect(site.media.galleryImageUrls).not.toContain(site.media.heroImageUrl);
  });

  it.each([
    ["Hausarztpraxis", "medical-practice", "wl-medical-practice-", ["Medical consultation", "Routine check-up", "Personal health guidance"]],
    ["Dental clinic", "dental-practice", "wl-dental-practice-", ["Dental consultation", "Preventive care visit", "Treatment planning"]],
    ["Ambulanter Pflegedienst", "home-care", "wl-home-care-", ["Home-care visit", "Everyday mobility support", "Family care coordination"]],
    ["Psychotherapie Praxis", "psychotherapy", "wl-therapy-practice-", ["Initial conversation", "Individual sessions", "Ongoing guidance"]],
  ])("selects a discrete health and care template for %s", (category, templateKey, servicePrefix, expectedServices) => {
    const site = generateSiteDocument({ ...profile, business: { name: "Care Practice", category }, services: [] });
    expect(site.templateKey).toBe(templateKey);
    expect(site.media.serviceImageUrls.every((asset) => asset.includes(servicePrefix))).toBe(true);
    expect(site.media.serviceImageUrls).not.toContain(site.media.heroImageUrl);
    expect(site.services.map((service) => service.title)).toEqual(expectedServices);
  });

  it("keeps construction specialist service packs separate", () => {
    const civil = generateSiteDocument({
      ...profile,
      business: { name: "Tiefbau Essen", category: "Civil engineering" },
    });
    const fibre = generateSiteDocument({
      ...profile,
      business: { name: "Glasfaser Technik", category: "Fiber network" },
    });
    const facade = generateSiteDocument({
      ...profile,
      business: { name: "Glasfassade GmbH", category: "Glazing" },
    });

    expect(civil.templateKey).toBe("civil-engineering");
    expect(civil.media.serviceImageUrls).toEqual([
      "/images/templates/wl-civil-survey-v1.png",
      "/images/templates/wl-civil-groundworks-v1.png",
      "/images/templates/wl-civil-infrastructure-v1.png",
    ]);
    expect(fibre.templateKey).toBe("fiber-network");
    expect(fibre.media.serviceImageUrls).toEqual([
      "/images/templates/wl-fiber-planning-v1.png",
      "/images/templates/wl-fiber-installation-v1.png",
      "/images/templates/wl-fiber-testing-v1.png",
    ]);
    expect(facade.templateKey).toBe("glass-facade");
    expect(facade.media.serviceImageUrls).toEqual([
      "/images/templates/wl-glass-assessment-v1.png",
      "/images/templates/wl-glass-installation-v1.png",
      "/images/templates/wl-glass-finish-v1.png",
    ]);
  });

  it("fills empty self-service content from the selected category template", () => {
    const site = generateSiteDocument({
      ...profile,
      business: { name: "Lichtwerk Elektro", category: "Electrician" },
      services: [],
    });
    expect(site.templateKey).toBe("electrician");
    expect(site.services.map((service) => service.title)).toEqual([
      "Electrical inspection",
      "Installation work",
      "Lighting and maintenance",
    ]);
    // Description fallback is the first sentence of the canonical locale-aware
    // about copy (never the English template starter line).
    const about = professionalAboutCopy({ name: "Lichtwerk Elektro", services: site.services, locale: "en", templateKey: "electrician" });
    expect(site.content.description).toBe(about.split(". ")[0]?.trim() + ".");
  });

  it("replaces Finder placeholder services with the selected template services", () => {
    const site = generateSiteDocument({
      ...profile,
      business: { name: "Werkstatt Nova", category: "Car repair service" },
      services: [{ title: "Consultation" }, { title: "Tailored service" }, { title: "Customer support" }],
    });
    expect(site.services.map((service) => service.title)).toEqual([
      "Vehicle diagnostics", "Maintenance and repairs", "Brakes and tyres",
    ]);
  });

  it("creates localized starter copy for each selected website language", () => {
    const site = generateSiteDocument({ ...profile, locale: "fr", services: [] });
    expect(site.locale).toBe("fr");
    expect(site.content.servicesTitle).toBe("Comment nous pouvons vous aider");
    expect(site.services[0]?.description).toContain(site.services[0]!.title);
  });

  it("creates distinct title-aware fallback descriptions for services without supplied copy", () => {
    for (const locale of supportedLocales) {
      const site = generateSiteDocument({
        ...profile,
        locale,
        services: [{ title: "Alpha" }, { title: "Beta" }, { title: "Gamma" }],
      });
      expect(new Set(site.services.map((service) => service.description)).size).toBe(3);
      site.services.forEach((service) => expect(service.description).toContain(service.title));
    }
  });

  it("preserves a supplied service description instead of replacing it", () => {
    const supplied = "A verified description supplied with this service.";
    const site = generateSiteDocument({ ...profile, services: [{ title: "Consultation", description: supplied }] });
    expect(site.services[0]?.description).toBe(supplied);
  });

  it("creates a fuller Albanian about section from verified services without inventing claims", () => {
    const site = generateSiteDocument({
      ...profile,
      locale: "sq",
      business: { name: "Northstar Servis", category: "Car repair service" },
      services: [{ title: "Diagnostikim i automjetit" }, { title: "Mirëmbajtje dhe riparime" }],
    });
    expect(site.content.aboutTitle).toBe("Rreth Northstar Servis");
    expect(site.content.aboutBody).toContain("Northstar Servis");
    expect(site.content.aboutBody).toContain("diagnostikimi i saktë");
    expect(site.content.aboutBody).toContain("kontrolli fillestar");
    expect(site.services[0]?.description).toContain("Diagnostikim i automjetit");
  });

  it("keeps every registered language complete and rejects unsupported locales", () => {
    for (const locale of supportedLocales) {
      expect(JSON.stringify(siteCopy[locale])).not.toMatch(/""/);
    }
    expect(resolveLocale("pt")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
  });

  it("preserves verified opening hours from a prepared profile", () => {
    const site = generateSiteDocument({
      ...profile,
      business: {
        ...profile.business,
        openingHours: [{ day: "monday", open: "10:00", close: "17:00" }],
      },
    });
    expect(site.contact.openingHours).toEqual([
      { day: "monday", open: "10:00", close: "17:00" },
    ]);
  });
});

describe("generateSiteDocument canonical category resolution (BSRC-DESIGN-P4-001)", () => {
  const baseProfile: PreparedBusinessProfile = {
    id: "profile-category-1",
    version: 1,
    sourceLeadId: "lead-category-1",
    locale: "sq",
    preparedAt: "2026-10-02T00:00:00Z",
    approvedSources: [],
    business: { name: "Metalika Konstruksion", category: "Ndërtim metalik" },
    services: [{ title: "Konstruksione metalike" }],
  };

  it("resolves a canonical subcategory key to its template instead of the midnight fallback", () => {
    const site = generateSiteDocument({
      ...baseProfile,
      business: { ...baseProfile.business, categoryKey: "construction-trades", subcategoryKey: "metal-construction" },
    });
    expect(site.templateKey).toBe("construction");
    expect(site.template).toBe("forge");
    expect(site.design?.archetype).toBe("industrial-bold");
  });

  it("resolves a canonical family key to the family default template", () => {
    const site = generateSiteDocument(
      { ...baseProfile, business: { name: baseProfile.business.name, category: "Shëndetësi", categoryKey: "healthcare" } },
      undefined,
      "auto",
    );
    expect(site.templateKey).toBe("medical-practice");
  });

  it("still prefers an explicit templateKey over the canonical category keys", () => {
    const site = generateSiteDocument(baseProfile, "hair-salon", "auto");
    expect(site.templateKey).toBe("hair-salon");
  });

  it("keeps free-text keyword matching as the compatibility fallback when no canonical keys exist", () => {
    const site = generateSiteDocument({ ...baseProfile, business: { name: "Metalika Konstruksion", category: "Metal Construction" } });
    expect(site.templateKey).toBe("construction");
  });

  it("falls back to the midnight template only for genuinely unknown categories", () => {
    const site = generateSiteDocument({ ...baseProfile, business: { name: "Metalika Konstruksion", category: "Gjëra krejtësisht të panjohura xyz" } });
    expect(site.templateKey).toBe("midnight");
  });

  it("ignores unknown canonical keys and uses the legacy path", () => {
    const site = generateSiteDocument(
      { ...baseProfile, business: { ...baseProfile.business, categoryKey: "not-a-family", subcategoryKey: "not-a-subcategory" } },
      undefined,
      "auto",
    );
    expect(site.templateKey).toBe("midnight");
  });
});
