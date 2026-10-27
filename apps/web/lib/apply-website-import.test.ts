import { describe, expect, it } from "vitest";
import { generateSiteDocument, type PreparedBusinessProfile } from "@platform/website-engine";
import {
  applyExistingWebsiteToSite,
  existingWebsiteSubmissionFromForm,
  validateExistingWebsiteSubmission,
} from "./apply-website-import";

const profile: PreparedBusinessProfile = {
  id: "import-profile",
  version: 1,
  sourceLeadId: "import-lead",
  locale: "sq",
  preparedAt: "2026-09-30T00:00:00.000Z",
  approvedSources: [],
  business: { name: "Studio Import", category: "barber" },
  services: [{ title: "Placeholder" }],
};

const sourceUrl = "https://old-business-site.de/";
const submission = {
  sourceUrl,
  importAcknowledged: true as const,
  logoUrl: "https://old-business-site.de/img/logo.png",
  heroImageUrl: "https://old-business-site.de/img/hero.webp",
  galleryImageUrls: ["https://old-business-site.de/img/1.jpg", "https://old-business-site.de/img/2.jpg"],
  services: [{ title: "Haarschnitt", description: "" }],
  contact: { phone: "+49 221 123456", email: "hallo@old-business-site.de", address: "Hauptstraße 12", city: "Köln" },
};

describe("validateExistingWebsiteSubmission", () => {
  it("accepts a complete acknowledged submission", () => {
    expect(validateExistingWebsiteSubmission(submission)).toMatchObject({
      sourceUrl, logoUrl: submission.logoUrl, services: [{ title: "Haarschnitt" }],
    });
  });

  it("rejects unacknowledged or foreign-origin assets", () => {
    expect(validateExistingWebsiteSubmission({ ...submission, importAcknowledged: false })).toBeNull();
    expect(validateExistingWebsiteSubmission({
      ...submission,
      logoUrl: "https://cdn.other.example/logo.png",
    })?.logoUrl).toBeUndefined();
    expect(validateExistingWebsiteSubmission({ sourceUrl, importAcknowledged: true })).not.toBeNull();
    expect(validateExistingWebsiteSubmission(undefined)).toBeNull();
  });

  it("keeps assets on http sources out of the site", () => {
    expect(validateExistingWebsiteSubmission({
      sourceUrl: "http://old-business-site.de/",
      importAcknowledged: true,
      logoUrl: "http://old-business-site.de/logo.png",
    })?.logoUrl).toBeUndefined();
  });
});

describe("existingWebsiteSubmissionFromForm", () => {
  it("parses the owner review form fields", () => {
    const data = new FormData();
    data.set("importSourceUrl", sourceUrl);
    data.set("importAcknowledged", "true");
    data.set("importKeepLogo", "true");
    data.set("importLogoUrl", submission.logoUrl!);
    data.set("importPhoto", submission.galleryImageUrls![0]);
    data.set("importService0Title", "Haarschnitt");
    data.set("importContactPhone", submission.contact.phone!);
    const parsed = existingWebsiteSubmissionFromForm(data);
    expect(parsed).toMatchObject({
      sourceUrl, logoUrl: submission.logoUrl, heroImageUrl: submission.galleryImageUrls![0],
      services: [{ title: "Haarschnitt" }], contact: { phone: submission.contact.phone },
    });
  });

  it("returns null without a source URL and refuses unacknowledged imports", () => {
    expect(existingWebsiteSubmissionFromForm(new FormData())).toBeNull();
    const data = new FormData();
    data.set("importSourceUrl", sourceUrl);
    data.set("importAcknowledged", "false");
    expect(existingWebsiteSubmissionFromForm(data)).toBeNull();
  });
});

describe("applyExistingWebsiteToSite", () => {
  it("merges facts, keeps provenance and generates locale descriptions", () => {
    const site = generateSiteDocument(profile);
    applyExistingWebsiteToSite(site, validateExistingWebsiteSubmission(submission)!);
    expect(site.importSource).toMatchObject({ url: sourceUrl });
    expect(site.services[0].title).toBe("Haarschnitt");
    expect(site.services[0].description).not.toBe("");
    expect(site.contact.phone).toBe(submission.contact.phone);
    expect(site.contact.address).toBe(submission.contact.address);
    expect(site.media.logoUrl).toBe(submission.logoUrl);
    expect(site.media.heroImageUrl).toBe(submission.heroImageUrl);
    expect(site.media.galleryImageUrls).toEqual(submission.galleryImageUrls!.slice(0, 3));
  });

  it("never overwrites existing contact values and refuses unacknowledged imports", () => {
    const site = generateSiteDocument(profile);
    site.contact.phone = "+355 69 000 0000";
    const acknowledged = { ...validateExistingWebsiteSubmission(submission)!, importAcknowledged: false } as unknown as Parameters<typeof applyExistingWebsiteToSite>[1];
    expect(() => applyExistingWebsiteToSite(site, acknowledged)).toThrow(/acknowledgement/i);
    applyExistingWebsiteToSite(site, validateExistingWebsiteSubmission(submission)!);
    expect(site.contact.phone).toBe("+355 69 000 0000");
    expect(site.contact.email).toBe(submission.contact.email);
  });
});
