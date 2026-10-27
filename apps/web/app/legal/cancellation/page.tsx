import Link from "next/link";
import type { Metadata } from "next";
import { LegalDocumentSections, LegalPage } from "../../../components/legal-page";
import { legalDocumentReviewState, legalDocumentSource } from "../../../lib/legal-documents";
import { resolvedPlatformLegalConfig } from "../../../lib/legal-config";
import { legalPageLocale } from "../../../lib/legal-page-locale";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const source = legalDocumentSource("cancellation", await legalPageLocale(searchParams));
  return { title: source.title, description: source.sections[0]?.body };
}

export default async function CancellationPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = await legalPageLocale(searchParams);
  const source = legalDocumentSource("cancellation", locale);
  const [review, legal] = await Promise.all([legalDocumentReviewState("cancellation", locale), resolvedPlatformLegalConfig()]);
  return <LegalPage locale={locale} eyebrow={source.eyebrow} title={source.title} version={source.version} reviewed={review.reviewed && legal.reviewed}>
    <section className="legal-action"><h2>{locale === "de" ? "Abonnement verwalten" : "Manage subscription"}</h2><p>{source.sections[0].body}</p><Link className="landing-button" href="/site-admin/login">{locale === "de" ? "Zum Business-Login" : "Business login"}</Link></section>
    <LegalDocumentSections sections={source.sections.slice(1)} />
    {legal.config.contactEmail ? <section><h2>{locale === "de" ? "Konfigurierter Kontakt" : "Configured contact"}</h2><a href={`mailto:${legal.config.contactEmail}`}>{legal.config.contactEmail}</a></section> : null}
  </LegalPage>;
}
