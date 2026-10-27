import type { Metadata } from "next";
import { LegalDocumentSections, LegalPage } from "../../../components/legal-page";
import { legalDocumentReviewState, legalDocumentSource } from "../../../lib/legal-documents";
import { legalPageLocale } from "../../../lib/legal-page-locale";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const source = legalDocumentSource("terms", await legalPageLocale(searchParams));
  return { title: source.title, description: source.sections[0]?.body };
}

export default async function TermsPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = await legalPageLocale(searchParams);
  const source = legalDocumentSource("terms", locale);
  const review = await legalDocumentReviewState("terms", locale);
  return <LegalPage locale={locale} eyebrow={source.eyebrow} title={source.title} version={source.version} reviewed={review.reviewed}>
    <LegalDocumentSections sections={source.sections} />
  </LegalPage>;
}
