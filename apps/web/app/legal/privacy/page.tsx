import type { Metadata } from "next";
import { LegalDocumentSections, LegalPage } from "../../../components/legal-page";
import { legalDocumentReviewState, legalDocumentSource } from "../../../lib/legal-documents";
import { publicOperatorAddress, resolvedPlatformLegalConfig } from "../../../lib/legal-config";
import { legalPageLocale } from "../../../lib/legal-page-locale";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const source = legalDocumentSource("privacy", await legalPageLocale(searchParams));
  return { title: source.title, description: source.sections[0]?.body };
}

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = await legalPageLocale(searchParams);
  const source = legalDocumentSource("privacy", locale);
  const [review, legal] = await Promise.all([legalDocumentReviewState("privacy", locale), resolvedPlatformLegalConfig()]);
  const operator = legal.config;
  return <LegalPage locale={locale} eyebrow={source.eyebrow} title={source.title} version={source.version} reviewed={review.reviewed && legal.reviewed}>
    {operator.legalBusinessName ? <section><h2>{locale === "de" ? "Verantwortlicher" : "Controller"}</h2><address><strong>{operator.legalBusinessName}</strong>{publicOperatorAddress(operator).map((line) => <span key={line}><br />{line}</span>)}<br />{operator.contactEmail ? <a href={`mailto:${operator.contactEmail}`}>{operator.contactEmail}</a> : null}</address></section> : null}
    <LegalDocumentSections sections={source.sections.slice(1)} />
  </LegalPage>;
}
