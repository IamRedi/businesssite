import { describe, expect, it } from "vitest";
import {
  generateSiteDocument,
  type PreparedBusinessProfile,
} from "@platform/website-engine";
import {
  applySiteEditorUpdate,
  legalIdentityPublicationBlocked,
  safePrivacyNoticeUrl,
} from "./site-editor-update";

const profile: PreparedBusinessProfile = {
  id: "prepared-editor-test-v1",
  version: 1,
  sourceLeadId: "editor-test-lead",
  locale: "en",
  preparedAt: "2026-08-19T00:00:00.000Z",
  approvedSources: [],
  business: {
    name: "Editor Test Studio",
    category: "Hair salon",
    email: "studio@example.test",
  },
  services: [
    { title: "Cut", description: "Original cut" },
    { title: "Colour", description: "Original colour" },
    { title: "Care", description: "Original care" },
  ],
};

const baseSite = () => generateSiteDocument(profile);
const form = (section: string, fields: Record<string, string> = {}) => {
  const data = new FormData();
  data.set("activeSection", section);
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

describe("site editor section updates", () => {
  it("updates identity without changing the other content fields", () => {
    const current = baseSite();
    const result = applySiteEditorUpdate(current, form("identity", { name: "New Studio Name" }));
    expect(result.section).toBe("identity");
    expect(result.document.content).toMatchObject({
      name: "New Studio Name",
      heroTitle: current.content.heroTitle,
    });
  });

  it("updates all editable content fields", () => {
    const result = applySiteEditorUpdate(baseSite(), form("content", {
      heroTitle: "Premium hair care",
      heroSubtitle: "Personal styling in the city.",
      aboutTitle: "About our studio",
      aboutBody: "A complete studio description.",
      servicesTitle: "Our services",
      contactTitle: "Book your visit",
    }));
    expect(result.document.content).toMatchObject({
      heroTitle: "Premium hair care",
      heroSubtitle: "Personal styling in the city.",
      aboutTitle: "About our studio",
      aboutBody: "A complete studio description.",
      servicesTitle: "Our services",
      contactTitle: "Book your visit",
    });
  });

  it("updates services independently and retains empty-field fallbacks", () => {
    const current = baseSite();
    const result = applySiteEditorUpdate(current, form("services", {
      service0Title: "Precision cut",
      service0Description: "Consultation, cut and finish.",
      service1Title: "",
      service1Description: "Dimensional colour service.",
    }));
    expect(result.document.services[0]).toEqual({
      title: "Precision cut",
      description: "Consultation, cut and finish.",
    });
    expect(result.document.services[1]).toEqual({
      title: current.services[1].title,
      description: "Dimensional colour service.",
    });
  });

  it("updates logo, hero, service and gallery media slots", () => {
    const result = applySiteEditorUpdate(baseSite(), form("media", {
      logoUrl: "https://assets.example/logo.webp",
      logoShape: "circle",
      heroImageUrl: "https://assets.example/hero.webp",
      serviceImage0: "https://assets.example/cut.webp",
      serviceImage1: "https://assets.example/colour.webp",
      serviceImage2: "https://assets.example/care.webp",
      gallery0: "https://assets.example/gallery-1.webp",
      gallery1: "https://assets.example/gallery-2.webp",
    }));
    expect(result.document.media).toMatchObject({
      logoUrl: "https://assets.example/logo.webp",
      logoShape: "circle",
      heroImageUrl: "https://assets.example/hero.webp",
      serviceImageUrls: [
        "https://assets.example/cut.webp",
        "https://assets.example/colour.webp",
        "https://assets.example/care.webp",
      ],
      galleryImageUrls: [
        "https://assets.example/gallery-1.webp",
        "https://assets.example/gallery-2.webp",
      ],
    });
  });

  it("falls back to a rounded-square logo for an unsupported shape", () => {
    const result = applySiteEditorUpdate(baseSite(), form("media", { logoShape: "triangle" }));
    expect(result.document.media.logoShape).toBe("rounded");
  });

  it("applies a supported design preset and safely falls back for unknown values", () => {
    const gold = applySiteEditorUpdate(baseSite(), form("design", { themeKey: "gold" }));
    expect(gold.document.themeKey).toBe("gold");
    const automatic = applySiteEditorUpdate(baseSite(), form("design", { themeKey: "not-a-theme" }));
    expect(automatic.document.themeKey).not.toBe("not-a-theme");
  });

  it("updates contact details and normalizes opening and closed days", () => {
    const data = form("contact", {
      phone: "+49 201 123456",
      email: "hello@example.test",
      address: "Sample Street 12",
      city: "Essen",
      mondayOpen: "08:30",
      mondayClose: "17:30",
      tuesdayOpen: "09:00",
      tuesdayClose: "18:00",
      legalBusinessName: "Editor Test Studio",
      legalStreet: "Sample Street 12",
      legalPostalCode: "45127",
      legalCity: "Essen",
      legalCountryCode: "de",
      legalContactEmail: "legal@example.test",
      legalPrivacyMode: "external",
      legalPrivacyNoticeUrl: "https://studio.example/privacy",
    });
    data.set("tuesdayClosed", "on");
    const result = applySiteEditorUpdate(baseSite(), data);
    expect(result.document.contact).toMatchObject({
      phone: "+49 201 123456",
      email: "hello@example.test",
      address: "Sample Street 12",
      city: "Essen",
    });
    expect(result.document.contact.openingHours?.[0]).toEqual({
      day: "monday",
      open: "08:30",
      close: "17:30",
      closed: false,
    });
    expect(result.document.contact.openingHours?.[1]).toEqual({
      day: "tuesday",
      open: undefined,
      close: undefined,
      closed: true,
    });
    expect(result.document.contact.openingHours?.[6]?.closed).toBe(true);
    expect(result.document.publicLegal).toMatchObject({
      legalBusinessName: "Editor Test Studio",
      countryCode: "DE",
      privacyNoticeUrl: "https://studio.example/privacy",
      privacyNoticePath: undefined,
    });
  });

  it("rejects unsafe customer privacy links", () => {
    const result = applySiteEditorUpdate(baseSite(), form("contact", {
      legalPrivacyNoticeUrl: "javascript:alert(1)",
    }));
    expect(result.document.publicLegal?.privacyNoticeUrl).toBeUndefined();
  });
});

const completeLegal = {
  legalBusinessName: "Editor Test Studio",
  street: "Sample Street 12",
  postalCode: "45127",
  city: "Essen",
  countryCode: "DE",
  contactEmail: "legal@example.test",
  privacyNoticeUrl: "https://studio.example/privacy",
};

describe("legalIdentityPublicationBlocked", () => {
  it("blocks a public site save that would clear the legal identity", () => {
    const site = baseSite();
    site.publicLegal = { ...completeLegal };
    const { document: next } = applySiteEditorUpdate(site, form("contact", {}));
    expect(legalIdentityPublicationBlocked(site, next, "2026-09-30T00:00:00.000Z")).toBe(true);
  });

  it("allows the completing save on a legacy public site and any private-site save", () => {
    const site = baseSite();
    site.publicLegal = {};
    const { document: completed } = applySiteEditorUpdate(site, form("contact", completeLegal));
    expect(legalIdentityPublicationBlocked(site, completed, "2026-09-30T00:00:00.000Z")).toBe(false);
    const { document: stillIncomplete } = applySiteEditorUpdate(site, form("contact", { legalBusinessName: completeLegal.legalBusinessName }));
    expect(legalIdentityPublicationBlocked(site, stillIncomplete, "2026-09-30T00:00:00.000Z")).toBe(false);
    const completeSite = baseSite();
    completeSite.publicLegal = { ...completeLegal };
    const { document: cleared } = applySiteEditorUpdate(completeSite, form("contact", {}));
    expect(legalIdentityPublicationBlocked(completeSite, cleared, undefined)).toBe(false);
  });
});

describe("safePrivacyNoticeUrl", () => {
  it("accepts https and root-relative targets only", () => {
    expect(safePrivacyNoticeUrl("https://studio.example/privacy")).toBe("https://studio.example/privacy");
    expect(safePrivacyNoticeUrl("/privacy")).toBe("/privacy");
    expect(safePrivacyNoticeUrl("//studio.example/privacy")).toBeUndefined();
    expect(safePrivacyNoticeUrl("http://studio.example/privacy")).toBeUndefined();
    expect(safePrivacyNoticeUrl("javascript:alert(1)")).toBeUndefined();
  });
});

// Contact and hours remain one form/contract, including split-day schedules.
it("preserves and edits an existing afternoon interval without replacing other sections", () => {
  const current = baseSite();
  current.contact.openingHours = [{ day: "friday", open: "08:00", close: "12:30", intervals: [{ open: "14:00", close: "19:00" }] }];
  const fields = { fridayOpen: "08:00", fridayClose: "12:30" };
  expect(applySiteEditorUpdate(current, form("contact", fields)).document.contact.openingHours?.[4].intervals).toEqual([{ open: "14:00", close: "19:00" }]);
  const result = applySiteEditorUpdate(current, form("contact", { ...fields, fridayInterval0Open: "14:30", fridayInterval0Close: "18:00" }));
  expect(result.document.contact.openingHours?.[4].intervals).toEqual([{ open: "14:30", close: "18:00" }]);
  expect(result.document.content).toEqual(current.content);
});
