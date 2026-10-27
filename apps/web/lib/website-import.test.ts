import { describe, expect, it } from "vitest";
import type { WebsiteResearch } from "./safe-website-reader";
import { buildImportPreview, classifyWebsiteImportError, detectWebsiteLanguage } from "./website-import";

const research = (overrides: Partial<WebsiteResearch> = {}): WebsiteResearch => ({
  sourceUrl: "https://old-business-site.de/",
  pagesRead: 2,
  pages: [
    {
      url: "https://old-business-site.de/",
      title: "Friseur Meister | Beste Pflege in Köln",
      description: "Ihr Friseur in Köln. Wir bieten Haarschnitt, Farbe und Pflege.",
      text: "Willkommen bei Friseur Meister. Der gute Friseur in Köln mit Erfahrung und Fürsorge. Und die Pflege ist für Sie da.",
      structuredData: [{
        "@type": "HairSalon",
        name: "Friseur Meister GmbH",
        telephone: "+49 221 123456",
        email: "hallo@old-business-site.de",
        priceRange: "€€",
        openingHours: "Mo-Fr 09:00-18:00; Sa 09:00-14:00",
        address: {
          "@type": "PostalAddress",
          streetAddress: "Hauptstraße 12",
          addressLocality: "Köln",
          postalCode: "50667",
          addressCountry: "DE",
        },
        makesOffer: [
          { "@type": "Offer", name: "Haarschnitt" },
          { "@type": "Offer", name: "Färben" },
        ],
        logo: "https://old-business-site.de/img/logo.png",
      }],
      images: [
        { url: "https://old-business-site.de/img/hero-banner.webp", alt: "hero banner" },
        { url: "https://old-business-site.de/img/salon.jpg", alt: "Salon" },
        { url: "https://cdn.third-party.example/stock.jpg", alt: "stock" },
      ],
      html: `<!doctype html><html><head><title>Friseur Meister</title>
        <meta property="og:title" content="Friseur Meister in Köln"/>
        <meta property="og:description" content="Ihr Friseur in Köln."/>
        <meta name="theme-color" content="#1a2b3c"/>
        <link rel="icon" href="/favicon.ico"/>
        <style>body { font-family: 'Montserrat', sans-serif; color: #aabbcc; } .cta { background: #1a2b3c; }</style>
        </head><body><img src="/img/logo.png" alt="logo"/></body></html>`,
    },
    {
      url: "https://old-business-site.de/kontakt",
      text: "Kontakt: Sie erreichen uns unter hallo@old-business-site.de",
      structuredData: [],
      images: [],
    },
  ],
  images: [
    { url: "https://old-business-site.de/img/hero-banner.webp", alt: "hero banner", pageUrl: "https://old-business-site.de/" },
    { url: "https://old-business-site.de/img/salon.jpg", alt: "Salon", pageUrl: "https://old-business-site.de/" },
    { url: "https://cdn.third-party.example/stock.jpg", alt: "stock", pageUrl: "https://old-business-site.de/" },
  ],
  contactHints: {
    emails: ["hallo@old-business-site.de"],
    phones: ["+49 221 123456"],
    socialLinks: ["https://instagram.com/friseurmeister", "https://facebook.com/friseurmeister"],
  },
  ...overrides,
});

describe("buildImportPreview", () => {
  it("extracts business facts, brand assets and legal suggestions from structured data", () => {
    const preview = buildImportPreview(research());
    expect(preview.sourceUrl).toBe("https://old-business-site.de/");
    expect(preview.businessName).toBe("Friseur Meister GmbH");
    expect(preview.services).toEqual(["Haarschnitt", "Färben"]);
    expect(preview.contact).toMatchObject({ phone: "+49 221 123456", email: "hallo@old-business-site.de", address: "Hauptstraße 12", city: "Köln" });
    expect(preview.legalSuggestions).toMatchObject({
      legalBusinessName: "Friseur Meister GmbH",
      street: "Hauptstraße 12",
      postalCode: "50667",
      city: "Köln",
      countryCode: "DE",
      contactEmail: "hallo@old-business-site.de",
    });
    expect(preview.openingHours).toEqual(["Mo-Fr 09:00-18:00", "Sa 09:00-14:00"]);
    expect(preview.priceRange).toBe("€€");
    expect(preview.sourceLanguage).toBe("de");
  });

  it("keeps image provenance on the declared origin and excludes foreign assets", () => {
    const preview = buildImportPreview(research());
    expect(preview.photos.every((photo) => new URL(photo.url).origin === "https://old-business-site.de")).toBe(true);
    expect(preview.photos.some((photo) => photo.url.includes("third-party"))).toBe(false);
    expect(preview.logoUrl).toBe("https://old-business-site.de/img/logo.png");
    expect(preview.faviconUrl).toBe("https://old-business-site.de/favicon.ico");
    expect(preview.photos[0].url).toBe("https://old-business-site.de/img/hero-banner.webp");
  });

  it("extracts brand colors, fonts and suggested hero copy", () => {
    const preview = buildImportPreview(research());
    expect(preview.colors).toContain("#1a2b3c");
    expect(preview.colors).toContain("#aabbcc");
    expect(preview.fonts).toContain("Montserrat");
    expect(preview.suggestedHero).toMatchObject({ title: "Friseur Meister in Köln", subtitle: "Ihr Friseur in Köln." });
  });

  it("falls back to page title for the business name without structured data", () => {
    const fallback = research();
    fallback.pages[0].structuredData = [];
    const preview = buildImportPreview(fallback);
    expect(preview.businessName).toBe("Friseur Meister");
  });

  it("derives the country code from the public suffix when structured data lacks it", () => {
    const minimal = research();
    minimal.pages[0].structuredData = [{ "@type": "LocalBusiness", name: "Studio B" }];
    const preview = buildImportPreview(minimal);
    expect(preview.legalSuggestions.countryCode).toBe("DE");
  });
});

describe("detectWebsiteLanguage", () => {
  it("recognizes supported source languages from stopword evidence", () => {
    expect(detectWebsiteLanguage("Der Salon und die Pflege für Sie")).toBe("de");
    expect(detectWebsiteLanguage("The best salon and barbering for your hair with our care")).toBe("en");
  });

  it("returns undefined when evidence is too weak to reuse free text", () => {
    expect(detectWebsiteLanguage("1234567890 €€€")).toBeUndefined();
  });
});

describe("classifyWebsiteImportError", () => {
  it("maps every canonical reader failure to a safe user-facing class", () => {
    expect(classifyWebsiteImportError(new Error("The website resolves to a private or unsafe network address."))).toBe("import_blocked");
    expect(classifyWebsiteImportError(new Error("IP-address website URLs are not allowed."))).toBe("import_blocked");
    expect(classifyWebsiteImportError(new Error("Only public HTTP(S) website URLs are allowed."))).toBe("import_blocked");
    expect(classifyWebsiteImportError(new Error("Website analysis timed out."))).toBe("import_timeout");
    expect(classifyWebsiteImportError(new Error("Website did not return HTML content."))).toBe("import_not_html");
    expect(classifyWebsiteImportError(new Error("Website content is too large."))).toBe("import_oversized");
    expect(classifyWebsiteImportError(new Error("The website redirected too many times."))).toBe("import_redirect");
    expect(classifyWebsiteImportError(new Error("Website returned HTTP 403."))).toBe("import_unreachable");
    expect(classifyWebsiteImportError(new Error("The website did not contain enough readable information to analyze."))).toBe("import_unreadable");
    expect(classifyWebsiteImportError(Object.assign(new Error("getaddrinfo ENOTFOUND missing.example"), { code: "ENOTFOUND" }))).toBe("import_dns");
  });

  it("stays generic for unknown failures", () => {
    expect(classifyWebsiteImportError(new Error("something unexpected"))).toBe("import_unavailable");
    expect(classifyWebsiteImportError(undefined)).toBe("import_unavailable");
  });
});
