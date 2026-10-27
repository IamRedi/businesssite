import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { generateSiteDocument, resolveLocale, siteCopy, supportedLocales, type PreparedBusinessProfile } from "@platform/website-engine";
import { SitePreview } from "./site-preview";

const profile: PreparedBusinessProfile = {
  id: "logo-profile",
  version: 1,
  sourceLeadId: "logo-lead",
  locale: "sq",
  preparedAt: "2026-08-23T00:00:00.000Z",
  approvedSources: [],
  business: { name: "Studio Logo", category: "Hair salon" },
  services: [{ title: "Prerje", description: "Prerje dhe stilim." }],
};

describe("business-site logo", () => {
  it("shows an uploaded circular logo above the business name", () => {
    const site = generateSiteDocument(profile);
    site.media.logoUrl = "https://assets.example/logo.webp";
    site.media.logoShape = "circle";
    const html = renderToStaticMarkup(<SitePreview site={site} />);
    expect(html).toContain("site-logo-circle");
    expect(html).toContain("Studio Logo");
  });

  it("keeps only the business name when no logo is uploaded", () => {
    const html = renderToStaticMarkup(<SitePreview site={generateSiteDocument(profile)} />);
    expect(html).not.toContain("class=\"site-logo");
    expect(html).toContain("Studio Logo");
  });

  it("uses only the customer-owned identity and privacy notice on the generated site", () => {
    const site = generateSiteDocument(profile);
    site.publicLegal = {
      legalBusinessName: "Customer Studio e.K.", street: "Customer Way 2",
      postalCode: "45127", city: "Essen", countryCode: "DE",
      contactEmail: "legal@customer.example", privacyNoticeUrl: "https://customer.example/privacy",
    };
    const html = renderToStaticMarkup(<SitePreview site={site} />);
    expect(html).toContain("Customer Studio e.K.");
    expect(html).toContain("https://customer.example/privacy");
    expect(html).toContain("Të dhënat juridike të biznesit");
    expect(html).toContain("Njoftimi i privatësisë i biznesit");
    expect(html).toContain(`href="https://customer.example/privacy"`);
    expect(html).not.toContain("Business legal information");
    expect(html).not.toContain("platform operator");
  });

  it("links the automatic platform privacy page to the current origin context", () => {
    const site = generateSiteDocument(profile);
    site.publicLegal = { privacyNoticePath: "/privacy" };
    expect(renderToStaticMarkup(<SitePreview site={site} />)).toContain(`href="/site/${site.slug}/privacy"`);
    expect(renderToStaticMarkup(<SitePreview site={site} privacyHref="/privacy" />)).toContain('href="/privacy"');
  });
});

describe("business-site public renderer locales", () => {
  it("renders every canonical website locale with its own copy", () => {
    for (const locale of supportedLocales) {
      const site = generateSiteDocument({
        ...profile,
        locale: resolveLocale(locale),
        business: { ...profile.business, name: `Studio ${locale.toUpperCase()}` },
      });
      const html = renderToStaticMarkup(<SitePreview site={site} />);
      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain(`Studio ${locale.toUpperCase()}`);
      expect(html).toContain(siteCopy[locale].selectedServices);
      expect(html).toContain(siteCopy[locale].businessLogin);
    }
  });
});
