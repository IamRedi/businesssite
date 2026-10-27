"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { SupportedLocale } from "@platform/website-engine";

export type SiteEditorSection = "identity" | "content" | "services" | "media" | "design" | "contact";
export type SiteEditorExtraSectionKey = "appointments" | "domain" | "security" | "preview";
export type SiteEditorExtraSection = { key: SiteEditorExtraSectionKey; label: string; description: string };
type Destination = "overview" | "website" | "appointments" | "media" | "settings";
const destinations: Destination[] = ["overview", "website", "appointments", "media", "settings"];
const icons = ["M3 10 12 3l9 7v11h-6v-7H9v7H3Z", "M3 4h18v16H3Zm0 5h18M8 4v5", "M4 5h16v16H4ZM8 2v6m8-6v6M4 11h16", "M3 3h18v18H3Zm0 14 6-6 4 4 3-3 5 5M8 7h.01", "M4 7h16M4 17h16M8 4v6m8 4v6"];
const websiteSections = ["content", "services", "media", "hours", "contact"] as const;

export function SiteEditorTabs({ panels, operationPanels, sidebarFooter, locale, navigationLabel, overview, businessName, websiteUrl }: {
  panels: Record<SiteEditorSection, ReactNode>; operationPanels: Record<SiteEditorExtraSectionKey, ReactNode>;
  sidebarFooter?: ReactNode; locale: SupportedLocale; navigationLabel?: string;
  overview: ReactNode; businessName: string; websiteUrl: string;
}) {
  const [active, setActive] = useState<Destination>("overview");
  const [section, setSection] = useState("content");
  const de = locale === "de";
  const labels = de ? ["Übersicht", "Website", "Termine", "Medien", "Einstellungen"] : ["Overview", "Website", "Appointments", "Media", "Settings"];
  const groupLabels = de ? ["Texte", "Leistungen & Preise", "Fotos & Videos", "Öffnungszeiten", "Kontakt"] : ["Text", "Services & prices", "Photos & videos", "Opening hours", "Contact"];
  const extra = (key: SiteEditorExtraSectionKey) => operationPanels[key];
  useEffect(() => {
    const sync = () => {
      const hash = location.hash.slice(1);
      if (destinations.includes(hash as Destination)) { setActive(hash as Destination); return; }
      if (["domain", "security", "design"].includes(hash) || (!hash && location.search.match(/[?&](domain|password|billing)=/))) { setActive("settings"); return; }
      if (["identity", "content", "services", "contact", "hours", "preview"].includes(hash)) {
        setActive("website"); setSection(hash === "identity" || hash === "preview" ? "content" : hash);
      }
    };
    sync(); window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return <div className="premium-workspace">
    <aside className="premium-sidebar">
      <a className="premium-brand" href="#overview"><span className="premium-monogram" aria-hidden="true">{businessName.slice(0, 1)}</span><span>{businessName}<small>Site Admin</small></span></a>
      <nav className="premium-nav" aria-label={navigationLabel ?? "Site Admin"}>
        {destinations.map((key, i) => <a key={key} href={`#${key}`} aria-current={active === key ? "page" : undefined} onClick={() => setActive(key)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={icons[i]} /></svg><span>{labels[i]}</span></a>)}
      </nav>
      <p className="premium-sidebar-note">{de ? "Ihr Unternehmen. Ihr Auftritt." : "Your business. Your website."}</p>
    </aside>
    <div className="premium-main">
      <header className="premium-heading"><div><p className="eyebrow">{businessName}</p><h1>{labels[destinations.indexOf(active)]}</h1></div>{active !== "overview" ? <a className="button secondary compact" href={websiteUrl} target="_blank" rel="noreferrer">{de ? "Website öffnen" : "Open website"} ↗</a> : null}</header>
      <div hidden={active !== "overview"}>{overview}</div>
      <div hidden={active !== "appointments"}>{extra("appointments")}</div>
      <div hidden={active !== "website" && active !== "media"} className="premium-editor">
        {active === "website" ? <nav className="premium-groups" aria-label={de ? "Website bearbeiten" : "Edit website"}>{websiteSections.map((key, i) => <a key={key} href={`#${key}`} aria-current={section === key ? "page" : undefined} onClick={() => { if (key === "media") setActive("media"); else setSection(key); }}>{groupLabels[i]}</a>)}</nav> : null}
        <div hidden={active !== "website" || section !== "content"}>{panels.content}<details className="premium-disclosure"><summary>{de ? "Unternehmensname" : "Business name"}</summary>{panels.identity}</details></div>
        <div hidden={active !== "website" || section !== "services"}>{panels.services}</div>
        <div hidden={active !== "media"}>{panels.media}</div>
        <div hidden={active !== "website" || !["contact", "hours"].includes(section)} className={section === "hours" ? "premium-hours-only" : "premium-contact-only"}>{panels.contact}</div>
        <details className="premium-disclosure premium-preview"><summary>{de ? "Website-Vorschau" : "Website preview"}</summary>{extra("preview")}</details>
      </div>
      <div hidden={active !== "settings"} className="premium-settings">
        {panels.design ? <details className="premium-disclosure"><summary>{de ? "Erscheinungsbild" : "Appearance"}</summary>{panels.design}</details> : null}
        <details className="premium-disclosure" open><summary>{de ? "Konto & Sicherheit" : "Account & security"}</summary>{extra("security")}</details>
        <details className="premium-disclosure"><summary>Domain</summary>{extra("domain")}</details>
        <div className="premium-account">{sidebarFooter}</div>
      </div>
    </div>
  </div>;
}
