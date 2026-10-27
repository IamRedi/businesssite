import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SiteDocument, SupportedLocale } from "@platform/website-engine";
import { SitePreview } from "./site-preview";

// BSRC-DESIGN-FOUNDATION-001 visual-regression fixtures: render the REAL
// SitePreview for a deterministic synthetic-document matrix and write
// self-contained static HTML for browser screenshots. Gated like the
// BSRC-AI-IMPORT-003 evidence harness: runs only with DESIGN_FIXTURES_OUT.

const STOCK = {
  construction: [
    "/images/templates/wl-construction-plans-v1.png",
    "/images/templates/wl-construction-structure-v1.png",
    "/images/templates/wl-construction-finish-v1.png",
  ],
};

type Fixture = { id: string; doc: SiteDocument };

function fixtureDoc(overrides: {
  id: string;
  locale?: SupportedLocale;
  template?: SiteDocument["template"];
  templateKey?: string;
  themeKey?: SiteDocument["themeKey"];
  theme?: SiteDocument["theme"];
  name?: string;
  services?: number;
  withImages?: boolean;
  withGallery?: boolean;
  withLegal?: boolean;
}): Fixture {
  const locale = overrides.locale ?? "en";
  const name = overrides.name ?? "Nordfeld Präzisionsbau GmbH";
  const services = Array.from({ length: overrides.services ?? 3 }, (_, index) => ({
    title: `Signature service ${index + 1} with a precise outcome`,
    description:
      "Careful planning, dependable workmanship and a result that holds up under real conditions, documented from the first visit to the final handover.",
  }));
  const withImages = overrides.withImages ?? true;
  const withGallery = overrides.withGallery ?? true;
  const heroImage = withImages ? STOCK.construction[0] : "";
  const serviceImages = withImages ? STOCK.construction : ["", "", ""];
  const gallery = withGallery && withImages ? [...STOCK.construction, "/images/templates/wl-crane-site-support-v1.png"] : [];
  const doc: SiteDocument = {
    id: `fixture-${overrides.id}`,
    profileId: "fixture-profile",
    slug: "fixture-site",
    locale,
    visibility: "public",
    template: overrides.template ?? "clarity",
    templateKey: overrides.templateKey ?? "construction",
    themeKey: overrides.themeKey ?? "auto",
    theme:
      overrides.theme ?? {
        primary: "#343535",
        accent: "#c79050",
        background: "#f7f6f2",
        surface: "#ffffff",
        text: "#292a29",
      },
    content: {
      name,
      description:
        "Practical construction support with clear planning, site coordination and quality-focused delivery for demanding projects.",
      heroTitle: name,
      heroSubtitle:
        "Practical construction support with clear planning, site coordination and quality-focused delivery.",
      aboutTitle: `About ${name}`,
      aboutBody:
        "For more than a decade the team has planned, coordinated and delivered construction work with a focus on clear communication and dependable schedules. Every project starts with a careful assessment and ends with a documented handover.",
      servicesTitle: "What we deliver",
      contactTitle: "Talk to the team",
    },
    contact: {
      name,
      phone: "+355 69 000 0000",
      email: "info@fixture-site.example",
      address: "Rruga e Kavajës 128",
      city: "Tirana",
      country: "Albania",
      openingHours: [
        { day: "monday", open: "08:00", close: "17:00" },
        { day: "wednesday", open: "08:00", close: "17:00" },
        { day: "friday", open: "08:00", close: "16:00" },
        { day: "saturday", open: "09:00", close: "13:00" },
      ],
    },
    publicLegal: overrides.withLegal === false ? undefined : {
      legalBusinessName: name,
      legalForm: "Sh.p.k.",
      authorizedRepresentative: "A. Krasniqi",
      street: "Rruga e Kavajës 128",
      postalCode: "1001",
      city: "Tirana",
      countryCode: "AL",
      contactEmail: "info@fixture-site.example",
      privacyNoticePath: "/privacy",
    },
    services,
    media: {
      logoUrl: "/images/templates/wl-construction-crane-v1.png",
      logoShape: "rounded",
      heroImageUrl: heroImage,
      serviceImageUrls: serviceImages,
      galleryImageUrls: gallery,
    },
    generatedAt: "2026-10-01T00:00:00.000Z",
  };
  return { id: overrides.id, doc };
}

function buildFixtures(): Fixture[] {
  const goldTheme = {
    primary: "#11100e",
    accent: "#c9a45d",
    background: "#15130f",
    surface: "#211d15",
    text: "#f5efe2",
  };
  return [
    fixtureDoc({ id: "clarity-base-en" }),
    fixtureDoc({ id: "studio-base-en", template: "studio" }),
    fixtureDoc({ id: "forge-base-en", template: "forge" }),
    fixtureDoc({ id: "forge-photos-en", template: "forge", services: 6 }),
    fixtureDoc({ id: "gold-base-en", template: "studio", templateKey: "hair-salon", themeKey: "gold", theme: goldTheme }),
    fixtureDoc({
      id: "clarity-long-en",
      name: "Klinik Dentare Précision für Ästhetische Zahnheilkunde, Implantologie & Kieferorthopädie am Rhein — Dr. med. dent. Müller-Haberland",
    }),
    fixtureDoc({ id: "clarity-services6-en", services: 6 }),
    fixtureDoc({ id: "clarity-nophotos-en", withImages: false, withGallery: false }),
    fixtureDoc({ id: "clarity-nolegal-en", withLegal: false }),
    fixtureDoc({ id: "clarity-base-de", locale: "de" }),
    fixtureDoc({ id: "clarity-long-de", locale: "de", name: "Klinik Dentare Précision für Ästhetische Zahnheilkunde, Implantologie & Kieferorthopädie am Rhein — Dr. med. dent. Müller-Haberland" }),
    fixtureDoc({ id: "clarity-base-sq", locale: "sq" }),
    fixtureDoc({ id: "clarity-long-sq", locale: "sq", name: "Klinik Dentare Précision për Stomatologji Estetike, Implantologji & Ortodonti në Rhin — Dr. med. dent. Müller-Haberland" }),
    fixtureDoc({ id: "gold-base-de", locale: "de", template: "studio", templateKey: "hair-salon", themeKey: "gold", theme: goldTheme }),
    ...premiumFixtures(),
  ];
}

/* ── P3 premium archetype fixtures (BSRC-DESIGN-P3-001) ───────────────────*/

type PremiumOverrides = {
  id: string;
  archetype: "industrial-bold" | "editorial-premium" | "local-service-conversion";
  locale?: SupportedLocale;
  name?: string;
  services?: number;
  photos?: "many" | "few" | "none";
  logo?: "landscape" | "square" | "none";
  projects?: number;
  withTrust?: boolean;
};

function premiumDesign(archetype: PremiumOverrides["archetype"], overrides: PremiumOverrides) {
  if (archetype === "industrial-bold") {
    return {
      archetype, archetypeVersion: "1", themeId: "forge", themeVersion: "1", designSystemVersion: "ds/1",
      heroVariant: overrides.photos === "none" ? "split" : "industrial",
      sectionOrder: ["hero", "projects", "services", "about", "gallery", "contact", "appointments", "legal", "footer"],
      sectionVariants: { services: "alternating", projects: "large-feature", about: "split", contact: "conversion" },
      density: "regular", visualStyle: "industrial", typographyDirection: "sans-led", colorDirection: "light",
      imageStrategy: "project-led", ctaStrategy: "quote-first",
      planner: { plannerVersion: "design-planner/2", generatorVersion: "site-generator/2", planSource: "deterministic", decidedAt: "2026-10-02T00:00:00.000Z", fallbacks: [] },
    } as const;
  }
  if (archetype === "editorial-premium") {
    return {
      archetype, archetypeVersion: "1", themeId: "clarity", themeVersion: "1", designSystemVersion: "ds/1",
      heroVariant: "editorial",
      sectionOrder: ["hero", "about", "services", "testimonials", "gallery", "contact", "appointments", "legal", "footer"],
      sectionVariants: { services: "editorial-list", about: "story", contact: "compact", gallery: "filmstrip", testimonials: "single-emphasis" },
      density: "spacious", visualStyle: "editorial", typographyDirection: "serif-led", colorDirection: "light",
      imageStrategy: "minimal", ctaStrategy: "form-first",
      planner: { plannerVersion: "design-planner/2", generatorVersion: "site-generator/2", planSource: "deterministic", decidedAt: "2026-10-02T00:00:00.000Z", fallbacks: [] },
    } as const;
  }
  return {
    archetype, archetypeVersion: "1", themeId: "clarity", themeVersion: "1", designSystemVersion: "ds/1",
    heroVariant: "centered",
    sectionOrder: ["hero", "trust", "services", "about", "contact", "appointments", "gallery", "legal", "footer"],
    sectionVariants: { services: "cards", about: "image-led", contact: "compact", trust: "badge-row", gallery: "grid-4" },
    density: "compact", visualStyle: "friendly", typographyDirection: "mixed", colorDirection: "light",
    imageStrategy: "balanced", ctaStrategy: "call-first",
    planner: { plannerVersion: "design-planner/2", generatorVersion: "site-generator/2", planSource: "deterministic", decidedAt: "2026-10-02T00:00:00.000Z", fallbacks: [] },
  } as const;
}

function premiumFixture(overrides: PremiumOverrides): Fixture {
  const archetypes = {
    "industrial-bold": {
      template: "forge" as const,
      name: overrides.name ?? "Vëlloz Industri Konstruksionesh",
      theme: { primary: "#2e3030", accent: "#e49b45", background: "#f7f4ed", surface: "#ffffff", text: "#272928" },
    },
    "editorial-premium": {
      template: "clarity" as const,
      name: overrides.name ?? "Studio Ligjore Meridian",
      theme: { primary: "#1f2e43", accent: "#b38b4d", background: "#f7f8fa", surface: "#ffffff", text: "#202a38" },
    },
    "local-service-conversion": {
      template: "clarity" as const,
      name: overrides.name ?? "Tek Service Qendra",
      theme: { primary: "#285164", accent: "#6cbdd0", background: "#f4fbfd", surface: "#ffffff", text: "#203b47" },
    },
  } as const;
  const base = archetypes[overrides.archetype];
  const serviceCount = overrides.services ?? 3;
  const photos = overrides.photos ?? "many";
  const imagePool = [
    "/images/templates/wl-construction-structure-v1.png",
    "/images/templates/wl-construction-finish-v1.png",
    "/images/templates/wl-crane-lift-plan-v1.png",
    "/images/templates/wl-construction-planning-v1.png",
    "/images/templates/wl-crane-site-support-v1.png",
    "/images/templates/wl-construction-deep-v1.png",
  ];
  const heroImage = photos === "none" ? "" : imagePool[0];
  const serviceImages = photos === "none" ? [] : photos === "few" ? imagePool.slice(0, 1) : imagePool.slice(0, 3);
  const gallery = photos === "none" ? [] : photos === "few" ? imagePool.slice(1, 2) : imagePool.slice(0, 4);
  const projectCount = overrides.projects ?? (overrides.archetype === "industrial-bold" ? 3 : 0);
  const logoUrl = overrides.logo === "none" || overrides.logo === undefined ? "" : overrides.logo === "square"
    ? "/images/templates/wl-construction-crane-v1.png"
    : "/images/templates/wl-construction-plans-v1.png";
  const locale = overrides.locale ?? "en";
  const doc: SiteDocument = {
    id: `fixture-${overrides.id}`,
    profileId: "fixture-profile",
    slug: "fixture-premium",
    locale,
    visibility: "public",
    template: base.template,
    templateKey: "construction",
    themeKey: "auto",
    theme: base.theme,
    design: premiumDesign(overrides.archetype, overrides) as unknown as SiteDocument["design"],
    content: {
      name: base.name,
      description: "Verified work, careful planning and dependable delivery documented from the first visit to the handover.",
      heroTitle: base.name,
      heroSubtitle: "Verified work, careful planning and dependable delivery for demanding projects.",
      aboutTitle: `About ${base.name}`,
      aboutBody: "Every engagement starts with a careful assessment and ends with a documented handover. The team plans precisely, coordinates openly and delivers to schedule without cutting corners.",
      servicesTitle: "What we deliver",
      contactTitle: "Talk to the team",
    },
    contact: {
      name: base.name,
      phone: "+355 69 000 0000",
      email: "info@fixture-premium.example",
      address: "Rruga e Kavajës 128",
      city: "Tirana",
      country: "Albania",
      openingHours: [
        { day: "monday", open: "08:00", close: "17:00" },
        { day: "wednesday", open: "08:00", close: "17:00" },
        { day: "friday", open: "08:00", close: "16:00" },
      ],
    },
    publicLegal: {
      legalBusinessName: base.name,
      legalForm: "Sh.p.k.",
      authorizedRepresentative: "A. Krasniqi",
      street: "Rruga e Kavajës 128",
      postalCode: "1001",
      city: "Tirana",
      countryCode: "AL",
      contactEmail: "info@fixture-premium.example",
      privacyNoticePath: "/privacy",
    },
    services: Array.from({ length: serviceCount }, (_, index) => ({
      title: `Signature service ${index + 1} with a precise outcome`,
      description: "Careful planning, dependable workmanship and a documented result that holds up under real conditions.",
    })),
    projects: Array.from({ length: projectCount }, (_, index) => ({
      name: `Reference project ${index + 1}`,
      summary: "Delivered to schedule with a documented handover and coordinated site work.",
      imageUrls: photos === "none" ? [] : [imagePool[index % imagePool.length]],
    })),
    trust: overrides.withTrust === false ? [] : [
      "Certified quality management",
      "Documented site handover",
      "Reference projects on request",
    ],
    media: {
      logoUrl,
      logoShape: "rounded",
      heroImageUrl: heroImage,
      serviceImageUrls: serviceImages,
      galleryImageUrls: gallery,
    },
    generatedAt: "2026-10-02T00:00:00.000Z",
  };
  return { id: overrides.id, doc };
}

function premiumFixtures(): Fixture[] {
  const layouts = ["industrial-bold", "editorial-premium", "local-service-conversion"] as const;
  const out: Fixture[] = [];
  for (const archetype of layouts) {
    const short = archetype === "industrial-bold" ? "industrial" : archetype === "editorial-premium" ? "editorial" : "local";
    out.push(premiumFixture({ id: `${short}-base-en`, archetype }));
    out.push(premiumFixture({ id: `${short}-few-photos-en`, archetype, photos: "few" }));
    out.push(premiumFixture({ id: `${short}-no-photos-en`, archetype, photos: "none" }));
    out.push(premiumFixture({ id: `${short}-services6-en`, archetype, services: 6 }));
    out.push(premiumFixture({ id: `${short}-services2-en`, archetype, services: 2 }));
    out.push(premiumFixture({
      id: `${short}-long-en`, archetype,
      name: "Ndërmarrje Industriale e Konstruksioneve Metalike, Fabricimit dhe Montimit me Përgjegjësi të Plotë — Nordfeld Stahlbau Müller-Haberland Sh.p.k.",
    }));
    out.push(premiumFixture({ id: `${short}-base-sq`, archetype, locale: "sq" }));
    out.push(premiumFixture({ id: `${short}-base-de`, archetype, locale: "de" }));
    out.push(premiumFixture({ id: `${short}-base-it`, archetype, locale: "it" }));
    out.push(premiumFixture({ id: `${short}-logo-square-en`, archetype, logo: "square" }));
    out.push(premiumFixture({ id: `${short}-logo-landscape-en`, archetype, logo: "landscape" }));
    out.push(premiumFixture({ id: `${short}-few-services-sq`, archetype, locale: "sq", services: 2, photos: "few" }));
  }
  return out;
}

describe("design fixtures: SitePreview static render matrix", () => {
  it.runIf(Boolean(process.env.DESIGN_FIXTURES_OUT))("writes the fixture matrix", () => {    const out = process.env.DESIGN_FIXTURES_OUT!;
    mkdirSync(out, { recursive: true });
    const stylesheet = readFileSync(new URL("../app/styles.css", import.meta.url), "utf8");
    const written: string[] = [];
    for (const fixture of buildFixtures()) {
      const markup = renderToStaticMarkup(<SitePreview site={fixture.doc} privacyHref="/privacy" />);
      const page = `<!doctype html><html lang="${fixture.doc.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${fixture.id}</title><style>body{margin:0}</style><style>${stylesheet}</style></head><body>${markup}</body></html>`;
      const file = join(out, `${fixture.id}.html`);
      writeFileSync(file, page);
      written.push(fixture.id);
    }
    expect(written.length).toBe(50);
    expect(readFileSync(join(out, "clarity-base-en.html"), "utf8")).toContain("generated-site-clarity");
    expect(readFileSync(join(out, "gold-base-en.html"), "utf8")).toContain("generated-site-luxury");
  });
});
