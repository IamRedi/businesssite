import Link from "next/link";
import type { ReactNode } from "react";
import { PlatformLogo } from "./platform-logo";
import type { LegalDocumentLocale } from "../lib/locale-model";

export function LegalPage({ eyebrow, title, children, version, reviewed, locale }: { eyebrow: string; title: string; children: ReactNode; version: string; reviewed: boolean; locale: LegalDocumentLocale }) {
  const suffix = `?lang=${locale}`;
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <Link className="landing-brand" href="/"><PlatformLogo /></Link>
        <Link href="/">{locale === "de" ? "Zur Startseite" : "Back to home"}</Link>
      </header>
      <article className="legal-document">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {!reviewed ? (
          <aside className="legal-config-warning" role="status">
            {locale === "de" ? "Rechtliche Prüfung erforderlich. Dieser Betriebsentwurf ist keine rechtliche Freigabe oder Zertifizierung; der Produktions-Checkout bleibt gesperrt, bis der Betreiber die professionelle Prüfung dokumentiert und exakt diese Version aktiviert." : "Legal review required. This operational draft is not legal approval or certification; production checkout remains blocked until the operator records professional review and activates this exact version."}
          </aside>
        ) : null}
        {children}
        <p className="legal-updated">Version: {version}</p>
      </article>
      <nav className="legal-footer" aria-label={locale === "de" ? "Rechtliche Informationen" : "Legal information"}>
        <Link href={`/legal/imprint${suffix}`}>{locale === "de" ? "Impressum" : "Legal notice"}</Link>
        <Link href={`/legal/privacy${suffix}`}>{locale === "de" ? "Datenschutz" : "Privacy"}</Link>
        <Link href={`/legal/terms${suffix}`}>{locale === "de" ? "AGB" : "Terms"}</Link>
        <Link href={`/legal/cancellation${suffix}`}>{locale === "de" ? "Kündigung" : "Cancellation"}</Link>
      </nav>
    </main>
  );
}

export function LegalDocumentSections({ sections }: { sections: Array<{ title: string; body: string }> }) {
  return <>{sections.map((section) => <section key={section.title}><h2>{section.title}</h2><p>{section.body}</p></section>)}</>;
}
