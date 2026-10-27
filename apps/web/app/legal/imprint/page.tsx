import type { Metadata } from "next";
import { LegalDocumentSections, LegalPage } from "../../../components/legal-page";
import { legalDocumentReviewState, legalDocumentSource } from "../../../lib/legal-documents";
import { publicOperatorAddress, resolvedPlatformLegalConfig } from "../../../lib/legal-config";
import { legalPageLocale } from "../../../lib/legal-page-locale";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const source = legalDocumentSource("imprint", await legalPageLocale(searchParams));
  return { title: source.title, description: source.sections[0]?.body };
}

export default async function ImprintPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = await legalPageLocale(searchParams);
  const source = legalDocumentSource("imprint", locale);
  const [review, legal] = await Promise.all([legalDocumentReviewState("imprint", locale), resolvedPlatformLegalConfig()]);
  const operator = legal.config;
  return <LegalPage locale={locale} eyebrow={source.eyebrow} title={source.title} version={source.version} reviewed={review.reviewed && legal.reviewed}>
    <LegalDocumentSections sections={source.sections} />
    {operator.legalBusinessName ? <section><h2>{locale === "de" ? "Plattformbetreiber" : "Platform operator"}</h2><address><strong>{operator.legalBusinessName}</strong>{operator.legalForm ? <><br />{operator.legalForm}</> : null}{publicOperatorAddress(operator).map((line) => <span key={line}><br />{line}</span>)}</address></section> : null}
    {operator.authorizedRepresentative ? <section><h2>{locale === "de" ? "Vertretung" : "Authorised representative"}</h2><p>{operator.authorizedRepresentative}</p></section> : null}
    {operator.contactEmail || operator.phone ? <section><h2>{locale === "de" ? "Rechtlicher Kontakt" : "Legal contact"}</h2><p>{operator.contactEmail ? <a href={`mailto:${operator.contactEmail}`}>{operator.contactEmail}</a> : null}{operator.phone ? <><br /><a href={`tel:${operator.phone}`}>{operator.phone}</a></> : null}</p></section> : null}
    {operator.registerName || operator.registerCourt || operator.registerNumber ? <section><h2>Register</h2><p>{[operator.registerName, operator.registerCourt, operator.registerNumber].filter(Boolean).join(" · ")}</p></section> : null}
    {operator.vatId ? <section><h2>VAT ID</h2><p>{operator.vatId}</p></section> : null}
    {operator.supervisoryAuthority ? <section><h2>{locale === "de" ? "Aufsichtsbehörde" : "Supervisory authority"}</h2><p>{operator.supervisoryAuthority}</p></section> : null}
    {operator.editorialResponsiblePerson ? <section><h2>{locale === "de" ? "Redaktionell verantwortlich" : "Editorial responsibility"}</h2><p>{operator.editorialResponsiblePerson}</p></section> : null}
  </LegalPage>;
}
