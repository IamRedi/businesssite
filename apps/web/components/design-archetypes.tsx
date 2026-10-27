import Link from "next/link";
/* eslint-disable @next/next/no-img-element -- customer asset URLs are selected at runtime. */
import type { SiteDesign, SiteDocument, SiteSectionId } from "@platform/website-engine";
import type { CSSProperties, ReactNode } from "react";
import { mapServiceIcon, resolveLocale, siteCopy } from "@platform/website-engine";
import { SiteServiceIcon } from "./site-icons";
import {
  AppointmentsSection,
  Brand,
  CallToAction,
  ContactSection,
  GallerySection,
  LegalSection,
  imageStyle,
  resolveSiteCopy,
  sectionCopy,
  type SectionUtility,
} from "./site-preview";

/* ── P3 premium archetypes (BSRC-DESIGN-P3-001) ────────────────────────────
   Real renderers for industrial-bold, editorial-premium and
   local-service-conversion. Every variant declared in the archetype registry
   ships here; composition follows design.sectionOrder, styling consumes the
   ds/1 token layer, and mobile is a designed composition (see styles.css).
   No business, product or brand names appear in this module. */

type Copy = ReturnType<typeof resolveSiteCopy>;

/** Per-site icon assignment (P5-001): semantic mapping with uniqueness and a
 * neutral fallback family; null when the document does not opt into icons. */

/* The primary call to action must stay visible on every palette: dark
   palettes can carry a primary that is nearly the page colour. */
function luminance(hex: string) {
  const value = /^#([0-9a-f]{6})$/i.exec(hex.trim())?.[1];
  if (!value) return null;
  const [r, g, b] = [0, 2, 4].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const la = luminance(a), lb = luminance(b);
  if (la === null || lb === null) return 21;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export function ctaColors(theme: SiteDocument["theme"]): Record<string, string> {
  if (contrast(theme.primary, theme.background) >= 3) return {};
  const fill = contrast(theme.accent, theme.background) >= 3 ? theme.accent : theme.text;
  const ink = contrast(fill, "#ffffff") >= contrast(fill, theme.background) ? "#ffffff" : theme.background;
  return { "--site-cta": fill, "--site-cta-ink": ink };
}

function serviceIcons(site: SiteDocument, design: SiteDesign): ReturnType<typeof mapServiceIcon>[] | null {
  if (!design.iconStyle) return null;
  const taken = new Set<string>();
  return site.services.map((service) => {
    const mapped = mapServiceIcon(service.title, taken);
    if (mapped) taken.add(mapped.icon);
    return mapped;
  });
}

function ServiceIconSlot({ mapping, style }: { mapping: ReturnType<typeof mapServiceIcon>; style: "line" | "solid" }) {
  return mapping ? <SiteServiceIcon icon={mapping.icon} style={style} /> : null;
}

const contactLine = (site: SiteDocument) =>
  [site.contact.address, site.contact.email, site.contact.phone].filter(Boolean).join(" · ");

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

const projects = (site: SiteDocument) => site.projects ?? [];
const trustLines = (site: SiteDocument) => site.trust ?? [];

function ActivateLink({ site, copy }: { site: SiteDocument; copy: Copy }) {
  return site.visibility !== "public" ? (
    <Link className="activate-site-link" href={`/subscribe?demo=${site.slug}`}>
      {copy.activateWebsite}
    </Link>
  ) : null;
}

function DesignHeader({ site, design, copy }: { site: SiteDocument; design: SiteDesign; copy: Copy }) {
  return (
    <header className="design-header">
      <Brand site={site} />
      <nav>
        {design.sectionOrder.includes("projects") ? <a href="#projects">{copy.projects}</a> : null}
        <a href="#services">{copy.selectedServices}</a>
        {design.sectionOrder.includes("about") ? <a href="#about">{copy.aboutBusiness}</a> : null}
        <a href="#contact">{copy.contact}</a>
      </nav>
      <ActivateLink site={site} copy={copy} />
    </header>
  );
}

function DesignFooter({ site, copy }: { site: SiteDocument; copy: Copy }) {
  return (
    <footer className="design-footer">
      <Brand site={site} />
      <span>
        {contactLine(site)} ·{" "}
        <Link className="business-login-link" href="/site-admin/login">
          {copy.businessLogin}
        </Link>
      </span>
    </footer>
  );
}

/* Mark-up shared by archetype hero variants. */
function HeroCopy({ site, copy, className }: { site: SiteDocument; copy: Copy; className?: string }) {
  return (
    <div className={className}>
      <p>{copy.independentBusiness}</p>
      <h1>{site.content.heroTitle}</h1>
      <p className="lede">{site.content.heroSubtitle}</p>
      <CallToAction site={site} />
    </div>
  );
}

/* ── industrial-bold ──────────────────────────────────────────────────────── */

function IndustrialHero({ site, design, copy, heroImage }: { site: SiteDocument; design: SiteDesign; copy: Copy; heroImage: CSSProperties | undefined }) {
  if (design.heroVariant === "split") {
    return (
      <section className="ib-hero ib-hero-split">
        <HeroCopy site={site} copy={copy} className="ib-hero-copy" />
        <div className="ib-hero-media" style={heroImage} />
      </section>
    );
  }
  return (
    <section className="ib-hero" style={heroImage}>
      <HeroCopy site={site} copy={copy} className="ib-hero-copy" />
      {trustLines(site).length ? (
        <div className="ib-hero-strip">
          {trustLines(site).slice(0, 3).map((line) => <span key={line}>{line}</span>)}
        </div>
      ) : null}
    </section>
  );
}

function IndustrialProjects({ site, design, copy }: { site: SiteDocument; design: SiteDesign; copy: Copy }) {
  const items = projects(site);
  if (!items.length) return null;
  if (design.sectionVariants.projects === "case-study-rows") {
    return (
      <section className="ib-projects" id="projects">
        <div className="design-section-head">
          <p>{copy.projects}</p>
          <h2>{copy.closerLook}</h2>
        </div>
        <div className="ib-case-rows">
          {items.slice(0, 6).map((project, index) => (
            <article key={project.name} className={`ib-case-row${index % 2 ? " ib-case-row-flip" : ""}`}>
              {project.imageUrls[0] ? <div className="ib-case-media" style={imageStyle(project.imageUrls[0])} /> : <div className="ib-case-media ib-case-media-empty" aria-hidden="true" />}
              <div className="ib-case-body">
                <h3>{project.name}</h3>
                {project.summary ? <p>{project.summary}</p> : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }
  if (design.sectionVariants.projects === "grid") {
    return (
      <section className="ib-projects" id="projects">
        <div className="design-section-head">
          <p>{copy.projects}</p>
          <h2>{copy.closerLook}</h2>
        </div>
        <div className="ib-project-grid">
          {items.slice(0, 6).map((project) => (
            <article key={project.name} className="ib-project-card">
              {project.imageUrls[0] ? <div className="ib-project-media" style={imageStyle(project.imageUrls[0])} /> : null}
              <h3>{project.name}</h3>
              {project.summary ? <p>{project.summary}</p> : null}
            </article>
          ))}
        </div>
      </section>
    );
  }
  // large-feature (default): first project full-width, the rest in a two-column grid.
  const [first, ...rest] = items.slice(0, 5);
  return (
    <section className="ib-projects" id="projects">
      <div className="design-section-head">
        <p>{copy.projects}</p>
        <h2>{copy.closerLook}</h2>
      </div>
      {first ? (
        <article className="ib-project-feature">
          {first.imageUrls[0] ? <div className="ib-feature-media" style={imageStyle(first.imageUrls[0])} /> : <div className="ib-feature-media ib-feature-media-empty" aria-hidden="true" />}
          <div className="ib-feature-body">
            <h3>{first.name}</h3>
            {first.summary ? <p>{first.summary}</p> : null}
          </div>
        </article>
      ) : null}
      {rest.length ? (
        <div className="ib-project-grid">
          {rest.map((project) => (
            <article key={project.name} className="ib-project-card">
              {project.imageUrls[0] ? <div className="ib-project-media" style={imageStyle(project.imageUrls[0])} /> : null}
              <h3>{project.name}</h3>
              {project.summary ? <p>{project.summary}</p> : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function IndustrialServices({ site, design }: { site: SiteDocument; design: SiteDesign }) {
  const icons = serviceIcons(site, design);
  if (design.sectionVariants.services === "cards") {
    return (
      <div className="ib-service-cards">
        {site.services.map((service, index) => (
          <article key={service.title} className="ib-service-card">
            {site.media.serviceImageUrls?.[index] ? (
              <div className="ib-service-media" style={imageStyle(site.media.serviceImageUrls[index])} />
            ) : null}
            <span className="ib-service-index">
              {icons?.[index] ? <ServiceIconSlot mapping={icons[index]!} style={design.iconStyle!} /> : null}
              {"0" + (index + 1)}
            </span>
            <h3>{service.title}</h3>
            <p>{service.description}</p>
          </article>
        ))}
      </div>
    );
  }
  // alternating (default): image/text rows that switch sides.
  return (
    <div className="ib-service-rows">
      {site.services.slice(0, 6).map((service, index) => (
        <article key={service.title} className={`ib-service-row${index % 2 ? " ib-row-flip" : ""}`}>
          <div className="ib-row-media" style={imageStyle(site.media.serviceImageUrls?.[index])} />
          <div className="ib-row-body">
            <span className="ib-service-index">
              {icons?.[index] ? <ServiceIconSlot mapping={icons[index]!} style={design.iconStyle!} /> : null}
              {"0" + (index + 1)}
            </span>
            <h3>{service.title}</h3>
            <p>{service.description}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function IndustrialAbout({ site, design, copy }: { site: SiteDocument; design: SiteDesign; copy: Copy }) {
  if (design.sectionVariants.about === "stats-led" && trustLines(site).length) {
    return (
      <section className="ib-about" id="about">
        <div className="ib-about-copy">
          <p>{copy.aboutBusiness}</p>
          <h2>{site.content.aboutTitle}</h2>
          <p>{site.content.aboutBody}</p>
        </div>
        <div className="ib-stats">
          {trustLines(site).slice(0, 4).map((line) => (
            <div key={line} className="ib-stat">
              <span>{line}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="ib-about" id="about">
      <div className="ib-about-copy">
        <p>{copy.aboutBusiness}</p>
        <h2>{site.content.aboutTitle}</h2>
        <p>{site.content.aboutBody}</p>
      </div>
      {site.media.galleryImageUrls[0] ? (
        <div className="ib-about-media" style={imageStyle(site.media.galleryImageUrls[0])} />
      ) : null}
    </section>
  );
}

function IndustrialContact({ site, utility, privacyHref }: { site: SiteDocument; utility: SectionUtility; privacyHref: string }) {
  const address = locationLabel(site.contact.address, site.contact.city, site.contact.country);
  return (
    <>
      <section className="ib-quote-band" id="contact">
        <p>{site.content.contactTitle}</p>
        <strong>{utility.details}</strong>
        <div className="ib-quote-actions">
          {site.contact.phone ? <a className="site-cta" href={`tel:${site.contact.phone}`}>{site.contact.phone}</a> : null}
          {site.contact.email ? <a className="ib-quote-mail" href={`mailto:${site.contact.email}`}>{site.contact.email}</a> : null}
          {address ? <span>{address}</span> : null}
        </div>
      </section>
      <ContactSection site={site} copy={resolveSiteCopy(site)} utility={utility} privacyHref={privacyHref} />
    </>
  );
}

function IndustrialBoldSite({ site, design, privacyHref }: { site: SiteDocument; design: SiteDesign; privacyHref: string }) {
  const locale = resolveLocale(site.locale);
  const copy = siteCopy[locale];
  const utility = sectionCopy[locale];
  const styles = {
    "--site-primary": site.theme.primary,
    "--site-accent": site.theme.accent,
    "--site-page": site.theme.background,
    "--site-surface": site.theme.surface,
    "--site-ink": site.theme.text,
    ...ctaColors(site.theme),
  } as CSSProperties;
  const section = (id: SiteSectionId): ReactNode => {
    switch (id) {
      case "hero": return <IndustrialHero key={id} site={site} design={design} copy={copy} heroImage={imageStyle(site.media.heroImageUrl)} />;
      case "projects": return <IndustrialProjects key={id} site={site} design={design} copy={copy} />;
      case "services": return (
        <section key={id} className="ib-services" id="services">
          <div className="design-section-head">
            <p>{copy.selectedServices}</p>
            <h2>{site.content.servicesTitle}</h2>
          </div>
          <IndustrialServices site={site} design={design} />
        </section>
      );
      case "about": return <IndustrialAbout key={id} site={site} design={design} copy={copy} />;
      case "gallery": return <GallerySection key={id} site={site} copy={copy} />;
      case "contact": return <IndustrialContact key={id} site={site} utility={utility} privacyHref={privacyHref} />;
      case "appointments": return <AppointmentsSection key={id} site={site} copy={copy} privacyHref={privacyHref} />;
      case "legal": return <LegalSection key={id} site={site} utility={utility} privacyHref={privacyHref} />;
      default: return null;
    }
  };
  return (
    <main
      className="generated-site generated-site-industrial-bold"
      style={styles}
      lang={locale}
      data-design-pipeline={design.designSystemVersion}
      data-design-archetype={design.archetype}
      data-design-theme={design.themeId}
      data-hero-prominence={design.heroProminence}
      data-design-fallbacks={design.planner.fallbacks.length ? design.planner.fallbacks.join(" | ").slice(0, 400) : undefined}
    >
      <DesignHeader site={site} design={design} copy={copy} />
      {design.sectionOrder.map((id) => section(id))}
      <DesignFooter site={site} copy={copy} />
    </main>
  );
}

/* ── editorial-premium ────────────────────────────────────────────────────── */

function EditorialHero({ site, design, copy }: { site: SiteDocument; design: SiteDesign; copy: Copy; heroImage: CSSProperties | undefined }) {
  const centered = design.heroVariant === "centered";
  return (
    <section className={`ep-hero${centered ? " ep-hero-centered" : ""}`}>
      <p>{copy.madeWithCare}</p>
      <h1>{site.content.heroTitle}</h1>
      <p className="lede">{site.content.heroSubtitle}</p>
      <CallToAction site={site} />
    </section>
  );
}

function EditorialServices({ site, design }: { site: SiteDocument; design: SiteDesign }) {
  const icons = serviceIcons(site, design);
  if (design.sectionVariants.services === "list") {
    return (
      <div className="ep-service-list">
        {site.services.map((service, index) => (
          <article key={service.title} className="ep-service-item">
            {icons?.[index] ? <ServiceIconSlot mapping={icons[index]!} style={design.iconStyle!} /> : null}
            <h3>{service.title}</h3>
            <p>{service.description}</p>
            <span>{"0" + (index + 1)}</span>
          </article>
        ))}
      </div>
    );
  }
  // editorial-list (default): numbered, hairline-ruled, no images.
  return (
    <div className="ep-editorial-list">
      {site.services.map((service, index) => (
        <article key={service.title} className="ep-editorial-item">
          {icons?.[index] ? <ServiceIconSlot mapping={icons[index]!} style={design.iconStyle!} /> : null}
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3>{service.title}</h3>
            <p>{service.description}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function EditorialAbout({ site, design }: { site: SiteDocument; design: SiteDesign }) {
  if (design.sectionVariants.about === "split") {
    return (
      <section className="ep-about ep-about-split" id="about">
        <div>
          <h2>{site.content.aboutTitle}</h2>
        </div>
        <p>{site.content.aboutBody}</p>
      </section>
    );
  }
  // story (default): single measured column with a display initial.
  return (
    <section className="ep-about" id="about">
      <p>{site.content.aboutTitle}</p>
      <p className="ep-story">{site.content.aboutBody}</p>
    </section>
  );
}

function EditorialContact({ site, utility, privacyHref }: { site: SiteDocument; utility: SectionUtility; privacyHref: string }) {
  return (
    <>
      <section className="ep-contact" id="contact">
        <div className="ep-contact-panel">
          <p>{site.content.contactTitle}</p>
          <strong>{utility.details}</strong>
          {site.contact.phone ? <a href={`tel:${site.contact.phone}`}>{site.contact.phone}</a> : null}
          {site.contact.email ? <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a> : null}
          {locationLabel(site.contact.address, site.contact.city, site.contact.country) ? (
            <span>{locationLabel(site.contact.address, site.contact.city, site.contact.country)}</span>
          ) : null}
        </div>
      </section>
      <ContactSection site={site} copy={resolveSiteCopy(site)} utility={utility} privacyHref={privacyHref} />
    </>
  );
}

function EditorialPremiumSite({ site, design, privacyHref }: { site: SiteDocument; design: SiteDesign; privacyHref: string }) {
  const locale = resolveLocale(site.locale);
  const copy = siteCopy[locale];
  const utility = sectionCopy[locale];
  const styles = {
    "--site-primary": site.theme.primary,
    "--site-accent": site.theme.accent,
    "--site-page": site.theme.background,
    "--site-surface": site.theme.surface,
    "--site-ink": site.theme.text,
    ...ctaColors(site.theme),
  } as CSSProperties;
  const testimonials = design.sectionOrder.includes("testimonials") && trustLines(site).length ? (
    <section className="ep-testimonials" id="testimonials">
      <blockquote>{trustLines(site)[0]}</blockquote>
    </section>
  ) : null;
  const gallery = design.sectionVariants.gallery === "filmstrip" && site.media.galleryImageUrls.filter(Boolean).length ? (
    <section className="ep-gallery" id="gallery">
      <div className="ep-filmstrip">
        {site.media.galleryImageUrls.filter(Boolean).slice(0, 4).map((photo) => (
          <div key={photo} className="ep-film-frame" style={imageStyle(photo)} />
        ))}
      </div>
    </section>
  ) : (
    <GallerySection site={site} copy={copy} />
  );
  const section = (id: SiteSectionId): ReactNode => {
    switch (id) {
      case "hero": return <EditorialHero key={id} site={site} design={design} copy={copy} heroImage={imageStyle(site.media.heroImageUrl)} />;
      case "about": return <EditorialAbout key={id} site={site} design={design} />;
      case "services": return (
        <section key={id} className="ep-services" id="services">
          <p>{copy.selectedServices}</p>
          <h2>{site.content.servicesTitle}</h2>
          <EditorialServices site={site} design={design} />
        </section>
      );
      case "testimonials": return testimonials;
      case "gallery": return gallery;
      case "contact": return <EditorialContact key={id} site={site} utility={utility} privacyHref={privacyHref} />;
      case "appointments": return <AppointmentsSection key={id} site={site} copy={copy} privacyHref={privacyHref} />;
      case "legal": return <LegalSection key={id} site={site} utility={utility} privacyHref={privacyHref} />;
      default: return null;
    }
  };
  return (
    <main
      className="generated-site generated-site-editorial-premium"
      style={styles}
      lang={locale}
      data-design-pipeline={design.designSystemVersion}
      data-design-archetype={design.archetype}
      data-design-theme={design.themeId}
      data-hero-prominence={design.heroProminence}
      data-design-fallbacks={design.planner.fallbacks.length ? design.planner.fallbacks.join(" | ").slice(0, 400) : undefined}
    >
      <DesignHeader site={site} design={design} copy={copy} />
      {design.sectionOrder.map((id) => section(id))}
      <DesignFooter site={site} copy={copy} />
    </main>
  );
}

/* ── local-service-conversion ─────────────────────────────────────────────── */

function LocalHero({ site, design, copy, heroImage }: { site: SiteDocument; design: SiteDesign; copy: Copy; heroImage: CSSProperties | undefined }) {
  if (design.heroVariant === "split") {
    return (
      <section className="ls-hero ls-hero-split">
        <HeroCopy site={site} copy={copy} className="ls-hero-copy" />
        <div className="ls-hero-media" style={heroImage} />
      </section>
    );
  }
  if (design.heroVariant === "fullscreen") {
    // P5-001 immersive hero: full-bleed category imagery under the copy —
    // the visually dominant treatment the automatic planner promises.
    return (
      <section className="ls-hero ls-hero-immersive" style={heroImage}>
        <HeroCopy site={site} copy={copy} className="ls-hero-copy" />
      </section>
    );
  }
  return (
    <section className="ls-hero ls-hero-centered">
      <HeroCopy site={site} copy={copy} className="ls-hero-copy" />
      {site.media.heroImageUrl ? <div className="ls-hero-media ls-hero-media-small" style={heroImage} /> : null}
    </section>
  );
}

function LocalTrust({ site, utility }: { site: SiteDocument; utility: SectionUtility }) {
  const chips = trustLines(site).slice(0, 4);
  const hours = site.contact.openingHours?.length ? `${utility.hours}` : "";
  const area = locationLabel(site.contact.address, site.contact.city, site.contact.country);
  if (!chips.length && !hours && !area) return null;
  return (
    <section className="ls-trust" id="trust">
      {chips.map((line) => <span key={line} className="ls-chip">{line}</span>)}
      {hours ? <span className="ls-chip">{hours}</span> : null}
      {area ? <span className="ls-chip">{area}</span> : null}
    </section>
  );
}

function LocalServices({ site, design }: { site: SiteDocument; design: SiteDesign }) {
  const icons = serviceIcons(site, design);
  if (design.sectionVariants.services === "icon-grid") {
    return (
      <div className="ls-icon-grid">
        {site.services.map((service, index) => (
          <article key={service.title} className="ls-icon-card">
            {icons?.[index]
              ? <ServiceIconSlot mapping={icons[index]!} style={design.iconStyle!} />
              : <span className="ls-glyph" aria-hidden="true">{String.fromCharCode(0x2776 + Math.min(index, 8))}</span>}
            <h3>{service.title}</h3>
            <p>{service.description}</p>
          </article>
        ))}
      </div>
    );
  }
  return (
    <div className="ls-cards">
      {site.services.map((service, index) => (
        <article key={service.title} className="ls-card">
          {icons?.[index] ? <ServiceIconSlot mapping={icons[index]!} style={design.iconStyle!} /> : null}
          {site.media.serviceImageUrls?.[index] ? (
            <div className="ls-card-media" style={imageStyle(site.media.serviceImageUrls[index])} />
          ) : null}
          <h3>{service.title}</h3>
          <p>{service.description}</p>
        </article>
      ))}
    </div>
  );
}

function LocalAbout({ site, design, copy }: { site: SiteDocument; design: SiteDesign; copy: Copy }) {
  if (design.sectionVariants.about === "split") {
    return (
      <section className="ls-about ls-about-split" id="about">
        <div>
          <p>{copy.aboutBusiness}</p>
          <h2>{site.content.aboutTitle}</h2>
          <p>{site.content.aboutBody}</p>
        </div>
        {site.media.galleryImageUrls[0] ? (
          <div className="ls-about-media" style={imageStyle(site.media.galleryImageUrls[0])} />
        ) : null}
      </section>
    );
  }
  // image-led (default): the photo leads, the story supports it.
  return (
    <section className="ls-about" id="about">
      {site.media.galleryImageUrls[0] ? (
        <div className="ls-about-media ls-about-media-lead" style={imageStyle(site.media.galleryImageUrls[0])} />
      ) : null}
      <div>
        <p>{copy.aboutBusiness}</p>
        <h2>{site.content.aboutTitle}</h2>
        <p>{site.content.aboutBody}</p>
      </div>
    </section>
  );
}

function LocalServiceSite({ site, design, privacyHref }: { site: SiteDocument; design: SiteDesign; privacyHref: string }) {
  const locale = resolveLocale(site.locale);
  const copy = siteCopy[locale];
  const utility = sectionCopy[locale];
  const styles = {
    "--site-primary": site.theme.primary,
    "--site-accent": site.theme.accent,
    "--site-page": site.theme.background,
    "--site-surface": site.theme.surface,
    "--site-ink": site.theme.text,
    ...ctaColors(site.theme),
  } as CSSProperties;
  const section = (id: SiteSectionId): ReactNode => {
    switch (id) {
      case "hero": return <LocalHero key={id} site={site} design={design} copy={copy} heroImage={imageStyle(site.media.heroImageUrl)} />;
      case "trust": return <LocalTrust key={id} site={site} utility={utility} />;
      case "services": return (
        <section key={id} className="ls-services" id="services">
          <p>{copy.selectedServices}</p>
          <h2>{site.content.servicesTitle}</h2>
          <LocalServices site={site} design={design} />
        </section>
      );
      case "about": return <LocalAbout key={id} site={site} design={design} copy={copy} />;
      case "gallery": return <GallerySection key={id} site={site} copy={copy} />;
      case "contact": return <ContactSection key={id} site={site} copy={copy} utility={utility} privacyHref={privacyHref} />;
      case "appointments": return <AppointmentsSection key={id} site={site} copy={copy} privacyHref={privacyHref} />;
      case "legal": return <LegalSection key={id} site={site} utility={utility} privacyHref={privacyHref} />;
      default: return null;
    }
  };
  return (
    <main
      className="generated-site generated-site-local-service-conversion"
      style={styles}
      lang={locale}
      data-design-pipeline={design.designSystemVersion}
      data-design-archetype={design.archetype}
      data-design-theme={design.themeId}
      data-hero-prominence={design.heroProminence}
      data-design-fallbacks={design.planner.fallbacks.length ? design.planner.fallbacks.join(" | ").slice(0, 400) : undefined}
    >
      <DesignHeader site={site} design={design} copy={copy} />
      {design.sectionOrder.map((id) => section(id))}
      <DesignFooter site={site} copy={copy} />
      <div className="ls-sticky-cta" aria-hidden="true">
        {site.contact.phone ? <a href={`tel:${site.contact.phone}`}>{copy.call} {site.contact.phone}</a> : null}
        <a href="#appointments">{copy.requestAppointment}</a>
      </div>
    </main>
  );
}

export function isPremiumArchetype(archetype: SiteDesign["archetype"]): boolean {
  return archetype === "industrial-bold" || archetype === "editorial-premium" || archetype === "local-service-conversion";
}

export function PremiumArchetypeSite({ site, design, privacyHref }: { site: SiteDocument; design: SiteDesign; privacyHref: string }) {
  if (design.archetype === "industrial-bold") return <IndustrialBoldSite site={site} design={design} privacyHref={privacyHref} />;
  if (design.archetype === "editorial-premium") return <EditorialPremiumSite site={site} design={design} privacyHref={privacyHref} />;
  return <LocalServiceSite site={site} design={design} privacyHref={privacyHref} />;
}
