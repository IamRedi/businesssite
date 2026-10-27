/* eslint-disable @next/next/no-img-element -- owner-selected, explicitly sized media. */
import type { CSSProperties, ReactNode } from "react";
import { siteCopy, resolveLocale, type SiteDocument, type CustomSiteDesign, type CustomSiteMedia } from "@platform/website-engine";
import { GalleryCarousel } from "./gallery-carousel";
import { VideoShowcase } from "./video-showcase";
import { CustomPriceList } from "./custom-price-list";
import { AppointmentRequestForm } from "./appointment-request-form";
import { PrivacyMap } from "./privacy-map";
import { SiteServiceIcon } from "./site-icons";
import { mapServiceIcon } from "@platform/website-engine";
import styles from "./custom-site.module.css";

const labels = {
  de: { work: "Einblicke. Ergebnisse. Handwerk.", video: "Im Salon", about: "Persönlich. Mit Präzision.", hours: "Öffnungszeiten", cta: "Zeit für einen neuen Look.", previous: "Vorheriges Bild", next: "Nächstes Bild", close: "Schließen", view: "Bild ansehen", all: "Alle", play: "Abspielen", pause: "Pause", closed: "Geschlossen", legal: "Impressum", privacy: "Datenschutz", directions: "Route planen", consent: "Google Maps wird erst nach Ihrer Zustimmung geladen.", load: "Karte laden" },
  en: { work: "A closer look at the craft.", video: "Inside the studio", about: "Personal. Precise.", hours: "Opening hours", cta: "Make time for yourself.", previous: "Previous image", next: "Next image", close: "Close", view: "View image", all: "All", play: "Play", pause: "Pause", closed: "Closed", legal: "Legal information", privacy: "Privacy", directions: "Get directions", consent: "Google Maps loads only with your consent.", load: "Load map" },
  fr: { work: "Notre travail", video: "Au salon", about: "À propos", hours: "Horaires", cta: "Prenez du temps pour vous.", previous: "Image précédente", next: "Image suivante", close: "Fermer", view: "Voir l’image", all: "Tout", play: "Lire", pause: "Pause", closed: "Fermé", legal: "Mentions légales", privacy: "Confidentialité", directions: "Itinéraire", consent: "Google Maps nécessite votre accord.", load: "Charger la carte" },
  es: { work: "Nuestro trabajo", video: "En el salón", about: "Sobre nosotros", hours: "Horario", cta: "Un momento para ti.", previous: "Imagen anterior", next: "Imagen siguiente", close: "Cerrar", view: "Ver imagen", all: "Todo", play: "Reproducir", pause: "Pausa", closed: "Cerrado", legal: "Aviso legal", privacy: "Privacidad", directions: "Ruta", consent: "Google Maps requiere su consentimiento.", load: "Cargar mapa" },
  it: { work: "Il nostro lavoro", video: "Nel salone", about: "Chi siamo", hours: "Orari", cta: "Un momento per te.", previous: "Immagine precedente", next: "Immagine successiva", close: "Chiudi", view: "Mostra immagine", all: "Tutto", play: "Riproduci", pause: "Pausa", closed: "Chiuso", legal: "Note legali", privacy: "Privacy", directions: "Indicazioni", consent: "Google Maps richiede il suo consenso.", load: "Carica mappa" },
  sq: { work: "Puna jonë", video: "Në sallon", about: "Rreth nesh", hours: "Orari", cta: "Kohë për një pamje të re.", previous: "Fotoja e mëparshme", next: "Fotoja tjetër", close: "Mbyll", view: "Shiko foton", all: "Të gjitha", play: "Luaj", pause: "Ndalo", closed: "Mbyllur", legal: "Të dhënat juridike", privacy: "Privatësia", directions: "Udhëzimet", consent: "Google Maps ngarkohet vetëm me pëlqimin tuaj.", load: "Ngarko hartën" },
};
const dayOffsets = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };
export function CustomSite({ site, design, media, privacyHref }: { site: SiteDocument; design: CustomSiteDesign; media: CustomSiteMedia; privacyHref: string }) {
  const locale = resolveLocale(site.locale), l = labels[locale], copy = siteCopy[locale], t = design.tokens;
  const image = (role: string) => media.images.find(i => i.role === role);
  const hero = image("hero"), logo = image("logo"), portrait = image("portrait"), gallery = media.images.filter(i => i.role === "gallery"), services = media.images.filter(i => i.role === "service");
  const address = [site.contact.address, site.contact.city && !site.contact.address?.includes(site.contact.city) ? site.contact.city : undefined].filter(Boolean).join(", ");
  const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const ctaHref = design.cta === "form-first" ? "#contact" : design.cta === "visit-first" && address ? directions : site.contact.phone ? `tel:${site.contact.phone.replace(/[^+\d]/g, "")}` : site.contact.email ? `mailto:${site.contact.email}` : "#contact";
  const ctaLabel = design.cta === "form-first" ? copy.getInTouch : design.cta === "visit-first" && address ? l.directions : site.contact.phone ? copy.call : copy.getInTouch;
  const cta = <a className={styles.cta} href={ctaHref}>{ctaLabel} <span aria-hidden="true">↗</span></a>;
  const brand = <a className={styles.brand} href="#hero">{logo ? <img src={logo.src} alt={logo.alt} width={logo.width} height={logo.height} /> : null}<span>{site.content.name}</span></a>;
  const section = (id: string, eyebrow: string, heading: string, body: ReactNode) => <section key={id} id={id} className={styles.section}><div className={styles.sectionHeading}><p className={styles.eyebrow}>{eyebrow}</p><h2>{heading}</h2></div>{body}</section>;
  const nodes: Record<string, ReactNode> = {
    pricing: site.priceList ? section("pricing", "", site.priceList.title, <CustomPriceList list={site.priceList} locale={locale} />) : null,
    hero: <section key="hero" id="hero" className={styles.hero} data-hero={design.hero}><div className={styles.heroCopy}><p className={styles.eyebrow}>{site.contact.category} · {site.contact.city}</p><h1>{site.content.heroTitle}</h1><p className={styles.lede}>{site.content.heroSubtitle}</p>{cta}<p className={styles.heroAddress}>{address}</p></div>{hero ? <div className={styles.heroPhoto}><img src={hero.src} alt={hero.alt} width={hero.width} height={hero.height} fetchPriority="high" loading="eager" /><span className={styles.photoCaption}>{site.content.name}</span></div> : null}</section>,
    services: section("services", copy.selectedServices, site.content.servicesTitle, <div className={styles.services} data-variant={design.variants.services}>{site.services.map((service, index) => <article key={service.title}><span className={styles.serviceNumber}>{String(index + 1).padStart(2, "0")}</span><SiteServiceIcon icon={mapServiceIcon(service.title, new Set())?.icon ?? "dot-a"} style={design.iconStyle} /><div><h3>{service.title}</h3><p>{service.description}</p></div>{design.variants.services === "image-cards" && services[index] ? <img src={services[index].src} alt={services[index].alt} width={services[index].width} height={services[index].height} loading="lazy" /> : null}</article>)}</div>),
    gallery: gallery.length ? section("gallery", copy.gallery, l.work, <GalleryCarousel images={gallery} config={design.gallery} labels={l} />) : null,
    video: media.videos.length ? section("video", l.video, l.work, <VideoShowcase videos={media.videos} images={media.images} decorative={design.video.mode === "decorative-loop"} aspect={design.video.aspect} labels={l} />) : null,
    about: section("about", copy.ourApproach, site.content.aboutTitle, <div className={styles.about}>{portrait ? <img src={portrait.src} alt={portrait.alt} width={portrait.width} height={portrait.height} loading="lazy" /> : null}<div><p>{site.content.aboutBody}</p>{cta}</div></div>),
    hours: site.contact.openingHours?.length ? section("hours", l.hours, l.hours, <dl className={styles.hours}>{site.contact.openingHours.map(h => <div key={h.day}><dt>{new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + dayOffsets[h.day])))}</dt><dd>{h.closed ? l.closed : [...(h.open && h.close ? [{ open: h.open, close: h.close }] : []), ...(h.intervals ?? [])].map(i => `${i.open}–${i.close}`).join(" / ")}</dd></div>)}</dl>) : null,
    contact: section("contact", copy.contact, site.content.contactTitle, <div className={styles.contact}><div><p>{address}</p>{site.contact.phone ? <a href={`tel:${site.contact.phone.replace(/[^+\d]/g, "")}`}>{site.contact.phone}</a> : null}{site.contact.email ? <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a> : null}{address ? <a href={directions}>{l.directions} ↗</a> : null}</div>{address ? <PrivacyMap address={address} title={site.content.name} directionsUrl={directions} directionsLabel={l.directions} consentText={l.consent} loadLabel={l.load} /> : null}</div>),
    cta: <section key="cta" className={styles.ctaBand}><p className={styles.eyebrow}>{site.content.name}</p><h2>{l.cta}</h2>{cta}</section>,
    social: gallery.length ? section("social", copy.gallery, copy.closerLook, <GalleryCarousel images={gallery} config={{ ...design.gallery, aspect: "square" }} labels={l} />) : null,
    legal: <section key="legal" id="legal" className={styles.legal}><h2>{l.legal}</h2>{site.publicLegal ? <p>{[site.publicLegal.legalBusinessName, site.publicLegal.street, site.publicLegal.postalCode, site.publicLegal.city, site.publicLegal.contactEmail].filter(Boolean).join(" · ")}</p> : null}<a href={privacyHref}>{l.privacy}</a></section>,
    footer: <footer key="footer" className={styles.footer}>{brand}<span>{address}</span><a href="#hero">↑</a></footer>,
  };
  const appointments = section("appointments", copy.appointments, copy.requestAppointment,
    <div className={styles.appointments}>
      <p>{copy.requestIntro}</p>
      <AppointmentRequestForm slug={site.slug} services={site.services} locale={locale} privacyNoticeUrl={privacyHref} />
    </div>);
  return <main className={styles.site} lang={locale} data-custom-design="custom/1" data-typography={design.typography} style={{ "--custom-bg": t.background, "--custom-surface": t.surface, "--custom-ink": t.text, "--custom-accent": t.accent, "--custom-muted": t.muted } as CSSProperties}>
    <header className={styles.header}>{brand}<nav aria-label={copy.selectedServices}><a href="#services">{copy.selectedServices}</a>{gallery.length ? <a href="#gallery">{copy.gallery}</a> : null}<a href="#contact">{copy.contact}</a></nav>{cta}</header>
    {design.sections.flatMap(id => id === "contact" ? [appointments, nodes[id]] : [nodes[id]])}
  </main>;
}
