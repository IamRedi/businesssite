import Link from "next/link";
/* eslint-disable @next/next/no-img-element -- customer logo URLs are selected at runtime. */
import type { SiteDesign, SiteDocument, SiteSectionId } from "@platform/website-engine";
import { usesDesignPipeline, hasCustomDesign } from "@platform/website-engine";
import { CustomSite } from "./custom-site";
import type { CSSProperties, ReactNode } from "react";
import { AppointmentRequestForm } from "./appointment-request-form";
import { PrivacyMap } from "./privacy-map";
import { resolveLocale, siteCopy } from "@platform/website-engine";
import { isPremiumArchetype, PremiumArchetypeSite } from "./design-archetypes";

const contactLine = (site: SiteDocument) =>
  [site.contact.address, site.contact.email, site.contact.phone]
    .filter(Boolean)
    .join(" · ");
const locationLabel = (address?: string, city?: string, country?: string) => {
  const normalizedAddress = address?.trim() ?? "";
  const normalizedCity = city?.trim() ?? "";
  const normalizedCountry = country?.trim() ?? "";
  const addressLower = normalizedAddress.toLocaleLowerCase();
  return [
    normalizedAddress,
    normalizedCity && !addressLower.includes(normalizedCity.toLocaleLowerCase()) ? normalizedCity : "",
    normalizedCountry && !addressLower.includes(normalizedCountry.toLocaleLowerCase()) ? normalizedCountry : "",
  ].filter(Boolean).join(", ");
};

export const imageStyle = (image?: string): CSSProperties | undefined =>
  image ? { backgroundImage: `url(${image})` } : undefined;

export function CallToAction({ site }: { site: SiteDocument }) {
  const copy = siteCopy[resolveLocale(site.locale)];
  return site.contact.phone ? (
    <a className="site-cta" href={`tel:${site.contact.phone}`}>
      {copy.call} {site.contact.phone}
    </a>
  ) : site.contact.email ? (
    <a className="site-cta" href={`mailto:${site.contact.email}`}>
      {copy.getInTouch}
    </a>
  ) : null;
}
export function Brand({ site }: { site: SiteDocument }) {
  const shape = site.media.logoShape === "circle" ? "circle" : "rounded";
  return (
    <span className="site-brand">
      {site.media.logoUrl ? (
        <img
          className={`site-logo site-logo-${shape}`}
          src={site.media.logoUrl}
          alt={`${site.content.name} logo`}
        />
      ) : null}
      <strong>{site.content.name}</strong>
    </span>
  );
}

function Services({ site }: { site: SiteDocument }) {
  return (
    <div className="site-services">
      {site.services.map((service, index) => (
        <article
          key={service.title}
          style={imageStyle(site.media.serviceImageUrls?.[index])}
        >
          <div>
            <span>0{index + 1}</span>
            <h3>{service.title}</h3>
            <p>{service.description}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

const dayIndex = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 } as const;
function dayLabel(day: keyof typeof dayIndex, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2024, 0, 1 + dayIndex[day])),
  );
}
export const sectionCopy = {
  de: { hours: "Öffnungszeiten", closed: "Geschlossen", directions: "Route öffnen", details: "Kontaktdaten", mapConsent: "Die Karte wird von Google Maps bereitgestellt. Erst nach Ihrer Auswahl wird eine Verbindung zu Google hergestellt.", loadMap: "Google Maps laden", mapFor: "Karte für", legalAria: "Rechtliche Angaben des Kundenunternehmens", legalTitle: "Rechtliche Angaben des Unternehmens", privacy: "Datenschutzhinweise des Unternehmens" },
  en: { hours: "Opening hours", closed: "Closed", directions: "Get directions", details: "Contact details", mapConsent: "The map is provided by Google Maps. A connection to Google is made only after you choose to load it.", loadMap: "Load Google Maps", mapFor: "Map for", legalAria: "Customer business legal identity", legalTitle: "Business legal information", privacy: "Customer business privacy notice" },
  fr: { hours: "Horaires", closed: "Fermé", directions: "Itinéraire", details: "Coordonnées", mapConsent: "La carte est fournie par Google Maps. La connexion ne sera établie qu’après votre choix.", loadMap: "Charger Google Maps", mapFor: "Carte de", legalAria: "Identité juridique de l’entreprise cliente", legalTitle: "Informations juridiques de l’entreprise", privacy: "Politique de confidentialité de l’entreprise" },
  es: { hours: "Horario", closed: "Cerrado", directions: "Cómo llegar", details: "Datos de contacto", mapConsent: "El mapa lo proporciona Google Maps. Solo se establecerá una conexión cuando decida cargarlo.", loadMap: "Cargar Google Maps", mapFor: "Mapa de", legalAria: "Identidad jurídica de la empresa cliente", legalTitle: "Información jurídica de la empresa", privacy: "Aviso de privacidad de la empresa" },
  it: { hours: "Orari", closed: "Chiuso", directions: "Indicazioni", details: "Contatti", mapConsent: "La mappa è fornita da Google Maps. La connessione avviene solo dopo la tua scelta.", loadMap: "Carica Google Maps", mapFor: "Mappa di", legalAria: "Identità legale dell’attività cliente", legalTitle: "Informazioni legali dell’attività", privacy: "Informativa privacy dell’attività" },
  sq: { hours: "Orari", closed: "Mbyllur", directions: "Hap udhëzimet", details: "Të dhënat e kontaktit", mapConsent: "Harta ofrohet nga Google Maps. Lidhja kryhet vetëm pasi të zgjidhni ta ngarkoni.", loadMap: "Ngarko Google Maps", mapFor: "Harta për", legalAria: "Identiteti juridik i biznesit klient", legalTitle: "Të dhënat juridike të biznesit", privacy: "Njoftimi i privatësisë i biznesit" },
} as const;

export type SectionUtility = (typeof sectionCopy)[keyof typeof sectionCopy];

export function GallerySection({ site, copy }: { site: SiteDocument; copy: ReturnType<typeof resolveSiteCopy> }) {
  const photos = Array.from(
    new Set(site.media.galleryImageUrls.filter(Boolean)),
  ).slice(0, 4);
  if (!photos.length) return null;
  return (
    <section className="site-gallery" id="gallery">
      <div>
        <p>{copy.gallery}</p>
        <h2>{copy.closerLook}</h2>
      </div>
      <div className="gallery-grid">
        {photos.map((photo, index) => (
          <div
            key={photo}
            className={`gallery-image image-${index + 1}`}
            style={imageStyle(photo)}
          />
        ))}
      </div>
    </section>
  );
}

export function ContactSection({ site, copy, utility, privacyHref }: { site: SiteDocument; copy: ReturnType<typeof resolveSiteCopy>; utility: SectionUtility; privacyHref: string }) {
  const address = locationLabel(site.contact.address, site.contact.city, site.contact.country);
  const directionsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : undefined;
  const openingHours = site.contact.openingHours ?? [];
  return (
    <section className="site-contact" id="contact">
      <div className="contact-panel">
        <p>{copy.contact}</p>
        <h2>{site.content.contactTitle}</h2>
        <p className="contact-copy">
          {site.content.contactTitle} — {copy.responsePersonal}
        </p>
        <div className="contact-card-grid">
          <div className="contact-detail-card">
            <span>{utility.details}</span>
            {site.contact.phone ? <a href={`tel:${site.contact.phone}`}>{site.contact.phone}</a> : null}
            {site.contact.email ? <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a> : null}
            {address ? <p>{address}</p> : null}
          </div>
          {openingHours.length ? (
            <div className="opening-hours-card">
              <span>{utility.hours}</span>
              <dl>{openingHours.map((hours) => <div key={hours.day}><dt>{dayLabel(hours.day, site.locale)}</dt><dd>{hours.closed ? utility.closed : [
                ...(hours.open && hours.close ? [`${hours.open} – ${hours.close}`] : []),
                ...(hours.intervals ?? []).map(interval => `${interval.open} – ${interval.close}`),
              ].join(" / ") || utility.closed}</dd></div>)}</dl>
            </div>
          ) : null}
        </div>
      </div>
      {address ? (
        <PrivacyMap address={address} title={`${utility.mapFor} ${site.content.name}`} directionsUrl={directionsUrl} directionsLabel={utility.directions} consentText={utility.mapConsent} loadLabel={utility.loadMap} />
      ) : (
        <div className="site-map site-map-empty">
          {copy.locationSoon}
        </div>
      )}
    </section>
  );
}

export function AppointmentsSection({ site, copy, privacyHref }: { site: SiteDocument; copy: ReturnType<typeof resolveSiteCopy>; privacyHref: string }) {
  return (
    <section className="site-appointments" id="appointments">
      <div>
        <p>{copy.appointments}</p>
        <h2>{copy.requestAppointment}</h2>
        <p>
          {copy.requestIntro}
        </p>
      </div>
      <AppointmentRequestForm slug={site.slug} services={site.services} locale={resolveLocale(site.locale)} privacyNoticeUrl={privacyHref} />
    </section>
  );
}

export function LegalSection({ site, utility, privacyHref }: { site: SiteDocument; utility: SectionUtility; privacyHref: string }) {
  return (
    <>
      {site.publicLegal?.legalBusinessName ? <section className="site-contact" aria-label={utility.legalAria}><div className="contact-panel"><p>{utility.legalTitle}</p><h2>{site.publicLegal.legalBusinessName}</h2><p>{[site.publicLegal.legalForm, site.publicLegal.authorizedRepresentative, site.publicLegal.street, [site.publicLegal.postalCode, site.publicLegal.city].filter(Boolean).join(" "), site.publicLegal.countryCode].filter(Boolean).join(" · ")}</p><p>{site.publicLegal.contactEmail ? <a href={`mailto:${site.publicLegal.contactEmail}`}>{site.publicLegal.contactEmail}</a> : null}</p>{site.publicLegal.registerName || site.publicLegal.registerNumber ? <p>{[site.publicLegal.registerName, site.publicLegal.registerNumber].filter(Boolean).join(" · ")}</p> : null}{site.publicLegal.vatId ? <p>VAT ID: {site.publicLegal.vatId}</p> : null}{site.publicLegal.privacyNoticeUrl || site.publicLegal.privacyNoticePath === "/privacy" ? <p><a href={site.publicLegal.privacyNoticeUrl || privacyHref}>{utility.privacy}</a></p> : null}</div></section> : null}
      <p className="site-owner-login-footer">
        <Link href="/site-admin/login">{siteCopy[resolveLocale(site.locale)].businessLogin}</Link>
      </p>
    </>
  );
}

function ActivateLink({ site, copy }: { site: SiteDocument; copy: ReturnType<typeof resolveSiteCopy> }) {
  return site.visibility !== "public" ? (
    <Link className="activate-site-link" href={`/subscribe?demo=${site.slug}`}>
      {copy.activateWebsite}
    </Link>
  ) : null;
}

export function resolveSiteCopy(site: SiteDocument) {
  return siteCopy[resolveLocale(site.locale)];
}

function CompleteBusinessSections({ site, privacyHref }: { site: SiteDocument; privacyHref: string }) {
  const locale = resolveLocale(site.locale);
  const copy = siteCopy[locale];
  const utility = sectionCopy[locale];
  return (
    <>
      <GallerySection site={site} copy={copy} />
      <ContactSection site={site} copy={copy} utility={utility} privacyHref={privacyHref} />
      <AppointmentsSection site={site} copy={copy} privacyHref={privacyHref} />
      <LegalSection site={site} utility={utility} privacyHref={privacyHref} />
    </>
  );
}

/* ── ds/1 design pipeline (BSRC-DESIGN-FOUNDATION-001) ─────────────────────
   Renders documents carrying a validated design block: composition comes
   from the archetype, section order from the plan, and unknown variants fail
   safe to the archetype default (fallbacks recorded on the document). The
   markup reuses the legacy class names, so the ds/1 token layer styles both
   pipelines identically. */

function DesignHero({ site, design, copy, heroImage }: { site: SiteDocument; design: SiteDesign; copy: ReturnType<typeof resolveSiteCopy>; heroImage: CSSProperties | undefined }) {
  if (design.archetype === "forge") {
    return (
      <section className="forge-hero">
        <div>
          <p>{copy.independentBusiness}</p>
          <h1>{site.content.heroTitle}</h1>
          <p className="lede">{site.content.heroSubtitle}</p>
          <CallToAction site={site} />
        </div>
        <div className="forge-image" style={heroImage} />
      </section>
    );
  }
  if (design.archetype === "studio") {
    return (
      <section className="studio-hero">
        <div className="studio-copy">
          <p>{copy.madeWithCare}</p>
          <h1>{site.content.heroTitle}</h1>
          <p className="lede">{site.content.heroSubtitle}</p>
          <CallToAction site={site} />
        </div>
        <div className="studio-image" style={heroImage}>
          <span>{site.content.servicesTitle}</span>
        </div>
      </section>
    );
  }
  return (
    <section className="clarity-hero" style={heroImage}>
      <div>
        <p>{copy.independentBusiness}</p>
        <h1>{site.content.heroTitle}</h1>
        <p className="lede">{site.content.heroSubtitle}</p>
        <CallToAction site={site} />
      </div>
    </section>
  );
}

function DesignServices({ site, design, copy }: { site: SiteDocument; design: SiteDesign; copy: ReturnType<typeof resolveSiteCopy> }) {
  if (design.archetype === "studio") {
    return (
      <section className="studio-services" id="services">
        <p>{copy.ourApproach}</p>
        <Services site={site} />
      </section>
    );
  }
  return (
    <section className={design.archetype === "forge" ? "forge-services" : "clarity-services"} id="services">
      <p>{copy.selectedServices}</p>
      <h2>{site.content.servicesTitle}</h2>
      <Services site={site} />
    </section>
  );
}

function DesignAbout({ site, design, copy }: { site: SiteDocument; design: SiteDesign; copy: ReturnType<typeof resolveSiteCopy> }) {
  if (design.archetype === "studio") {
    return (
      <section className="studio-about" id="about">
        <h2>{site.content.aboutTitle}</h2>
        <p>{site.content.aboutBody}</p>
        <span>
          {site.content.contactTitle} — {contactLine(site)}
        </span>
      </section>
    );
  }
  if (design.archetype === "forge") {
    return (
      <section className="forge-about" id="about">
        <p>{copy.aboutBusiness}</p>
        <div>
          <h2>{site.content.aboutTitle}</h2>
          <p>{site.content.aboutBody}</p>
        </div>
      </section>
    );
  }
  return (
    <section className="clarity-about" id="about">
      <div>
        <p>{copy.aboutBusiness}</p>
        <h2>{site.content.aboutTitle}</h2>
      </div>
      <p>{site.content.aboutBody}</p>
    </section>
  );
}

function DesignSection({ id, site, design, utility, privacyHref }: { id: SiteSectionId; site: SiteDocument; design: SiteDesign; utility: SectionUtility; privacyHref: string }): ReactNode {
  const copy = resolveSiteCopy(site);
  switch (id) {
    case "hero": return <DesignHero key={id} site={site} design={design} copy={copy} heroImage={imageStyle(site.media.heroImageUrl)} />;
    case "services": return <DesignServices key={id} site={site} design={design} copy={copy} />;
    case "about": return <DesignAbout key={id} site={site} design={design} copy={copy} />;
    // projects/trust/testimonials are contract-accepted but not renderable in
    // these archetype versions; resolveSiteDesignInput records the skip.
    case "projects": case "trust": case "testimonials": return null;
    case "gallery": return <GallerySection key={id} site={site} copy={copy} />;
    case "contact": return <ContactSection key={id} site={site} copy={copy} utility={utility} privacyHref={privacyHref} />;
    case "appointments": return <AppointmentsSection key={id} site={site} copy={copy} privacyHref={privacyHref} />;
    case "legal": return <LegalSection key={id} site={site} utility={utility} privacyHref={privacyHref} />;
    case "footer": return null;
    default: return null;
  }
}

function DesignSite({ site, design, privacyHref }: { site: SiteDocument; design: SiteDesign; privacyHref: string }) {
  const locale = resolveLocale(site.locale);
  const copy = siteCopy[locale];
  const utility = sectionCopy[locale];
  const styles = {
    "--site-primary": site.theme.primary,
    "--site-accent": site.theme.accent,
    "--site-page": site.theme.background,
    "--site-surface": site.theme.surface,
    "--site-ink": site.theme.text,
  } as CSSProperties;
  return (
    <main
      className={`generated-site generated-site-${design.archetype}`}
      style={styles}
      lang={locale}
      data-design-pipeline={design.designSystemVersion}
      data-design-archetype={design.archetype}
      data-design-theme={design.themeId}
      data-hero-prominence={design.heroProminence}
      data-design-fallbacks={design.planner.fallbacks.length ? design.planner.fallbacks.join(" | ").slice(0, 400) : undefined}
    >
      <header>
        {/* ds/1 studio upgrade: the customer's logo shows in the header when
            one exists (the frozen legacy studio header was text-only, which
            would silently drop logos on new gold-theme sites). */}
        {design.archetype === "studio" && site.media.logoUrl
          ? <Brand site={site} />
          : design.archetype === "studio"
            ? <strong>{site.content.name}</strong>
            : <Brand site={site} />}
        <nav><a href="#services">{copy.selectedServices}</a><a href="#about">{copy.aboutBusiness}</a><a href="#contact">{copy.contact}</a></nav>
        <ActivateLink site={site} copy={copy} />
      </header>
      {design.sectionOrder.map((id) => DesignSection({ id, site, design, utility, privacyHref }))}
      {design.archetype !== "studio" ? (
        <footer>
          <strong>{site.content.contactTitle}</strong>
          <span>
            {contactLine(site)} ·{" "}
            <Link className="business-login-link" href="/site-admin/login">
              {copy.businessLogin}
            </Link>
          </span>
        </footer>
      ) : null}
    </main>
  );
}

export function SitePreview({
  site,
  privacyHref,
}: {
  site: SiteDocument;
  /** Where the privacy notice lives on the current origin. Platform-host pages serve /site/<slug>/privacy; a custom domain serves /privacy. */
  privacyHref?: string;
}) {
  // An explicit external privacyNoticeUrl always wins; otherwise the platform
  // privacy page resolves against the current origin context.
  const resolvedPrivacyHref = privacyHref ?? `/site/${site.slug}/privacy`;
  if (hasCustomDesign(site)) return <CustomSite site={site} design={site.customDesign!} media={site.customMedia!} privacyHref={site.publicLegal?.privacyNoticeUrl ?? resolvedPrivacyHref} />;
  const locale = resolveLocale(site.locale);
  const copy = siteCopy[locale];
  const { theme, content, media } = site;
  // Documents carrying a valid ds/1 design block render through the design
  // pipeline; every other document renders through the frozen legacy path.
  if (usesDesignPipeline(site.design)) {
    if (isPremiumArchetype(site.design.archetype))
      return <PremiumArchetypeSite site={site} design={site.design} privacyHref={site.publicLegal?.privacyNoticeUrl ?? resolvedPrivacyHref} />;
    return <DesignSite site={site} design={site.design} privacyHref={site.publicLegal?.privacyNoticeUrl ?? resolvedPrivacyHref} />;
  }
  const styles = {
    "--site-primary": theme.primary,
    "--site-accent": theme.accent,
    "--site-page": theme.background,
    "--site-surface": theme.surface,
    "--site-ink": theme.text,
  } as CSSProperties;
  const heroImage = imageStyle(media.heroImageUrl);

  if (site.themeKey === "gold")
    return (
      <main className="generated-site generated-site-luxury" style={styles} lang={locale}>
        <header>
          <Brand site={site} />
          <nav><a href="#services">{copy.selectedServices}</a><a href="#gallery">{copy.gallery}</a><a href="#contact">{copy.contact}</a></nav>
          <ActivateLink site={site} copy={copy} />
        </header>
        <section className="luxury-hero" style={heroImage}>
          <div>
            <p>{copy.madeWithCare}</p>
            <h1>{content.heroTitle}</h1>
            <p className="lede">{content.heroSubtitle}</p>
            <CallToAction site={site} />
          </div>
        </section>
        <section className="luxury-intro">
          <span>01</span>
          <div>
            <p>{copy.ourApproach}</p>
            <h2>{content.aboutTitle}</h2>
            <p>{content.aboutBody}</p>
          </div>
        </section>
        <section className="luxury-services" id="services">
          <p>{copy.selectedServices}</p>
          <Services site={site} />
        </section>
        <CompleteBusinessSections site={site} privacyHref={site.publicLegal?.privacyNoticeUrl ?? resolvedPrivacyHref} />
        <footer>
          <Brand site={site} />
          <span>
            {contactLine(site)} ·{" "}
            <Link className="business-login-link" href="/site-admin/login">
              {copy.businessLogin}
            </Link>
          </span>
        </footer>
      </main>
    );

  if (site.template === "forge")
    return (
      <main className="generated-site generated-site-forge" style={styles} lang={locale}>
        <header>
          <Brand site={site} />
          <nav><a href="#services">{copy.selectedServices}</a><a href="#about">{copy.aboutBusiness}</a><a href="#contact">{copy.contact}</a></nav>
          <ActivateLink site={site} copy={copy} />
        </header>
        <section className="forge-hero">
          <div>
            <p>{copy.independentBusiness}</p>
            <h1>{content.heroTitle}</h1>
            <p className="lede">{content.heroSubtitle}</p>
            <CallToAction site={site} />
          </div>
          <div className="forge-image" style={heroImage} />
        </section>
        <section className="forge-services" id="services">
          <p>{copy.selectedServices}</p>
          <h2>{content.servicesTitle}</h2>
          <Services site={site} />
        </section>
        <section className="forge-about" id="about">
          <p>{copy.aboutBusiness}</p>
          <div>
            <h2>{content.aboutTitle}</h2>
            <p>{content.aboutBody}</p>
          </div>
        </section>
        <CompleteBusinessSections site={site} privacyHref={site.publicLegal?.privacyNoticeUrl ?? resolvedPrivacyHref} />
        <footer>
          <strong>{content.contactTitle}</strong>
          <span>
            {contactLine(site)} ·{" "}
            <Link className="business-login-link" href="/site-admin/login">
              {copy.businessLogin}
            </Link>
          </span>
        </footer>
      </main>
    );

  if (site.template === "studio")
    return (
      <main className="generated-site generated-site-studio" style={styles} lang={locale}>
        <header>
          <strong>{content.name}</strong>
          <nav><a href="#services">{copy.selectedServices}</a><a href="#about">{copy.aboutBusiness}</a><a href="#contact">{copy.contact}</a></nav>
          <ActivateLink site={site} copy={copy} />
        </header>
        <section className="studio-hero">
          <div className="studio-copy">
            <p>{copy.madeWithCare}</p>
            <h1>{content.heroTitle}</h1>
            <p className="lede">{content.heroSubtitle}</p>
            <CallToAction site={site} />
          </div>
          <div className="studio-image" style={heroImage}>
            <span>{content.servicesTitle}</span>
          </div>
        </section>
        <section className="studio-services" id="services">
          <p>{copy.ourApproach}</p>
          <Services site={site} />
        </section>
        <section className="studio-about" id="about">
          <h2>{content.aboutTitle}</h2>
          <p>{content.aboutBody}</p>
          <span>
            {content.contactTitle} — {contactLine(site)}
          </span>
        </section>
        <CompleteBusinessSections site={site} privacyHref={site.publicLegal?.privacyNoticeUrl ?? resolvedPrivacyHref} />
      </main>
    );

  return (
    <main className="generated-site generated-site-clarity" style={styles} lang={locale}>
      <header>
        <Brand site={site} />
        <nav><a href="#services">{copy.selectedServices}</a><a href="#about">{copy.aboutBusiness}</a><a href="#contact">{copy.contact}</a></nav>
        <ActivateLink site={site} copy={copy} />
      </header>
      <section className="clarity-hero" style={heroImage}>
        <div>
          <p>{copy.independentBusiness}</p>
          <h1>{content.heroTitle}</h1>
          <p className="lede">{content.heroSubtitle}</p>
          <CallToAction site={site} />
        </div>
      </section>
      <section className="clarity-services" id="services">
          <p>{copy.selectedServices}</p>
        <h2>{content.servicesTitle}</h2>
        <Services site={site} />
      </section>
      <section className="clarity-about" id="about">
        <div>
          <p>{copy.aboutBusiness}</p>
          <h2>{content.aboutTitle}</h2>
        </div>
        <p>{content.aboutBody}</p>
      </section>
      <CompleteBusinessSections site={site} privacyHref={site.publicLegal?.privacyNoticeUrl ?? resolvedPrivacyHref} />
      <footer>
        <strong>{content.contactTitle}</strong>
        <span>
          {contactLine(site)} ·{" "}
          <Link className="business-login-link" href="/site-admin/login">
            {copy.businessLogin}
          </Link>
        </span>
      </footer>
    </main>
  );
}
