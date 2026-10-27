import { createHash } from "node:crypto";
import { PostgresLegalRepository, type CheckoutDocumentEvidence, type LegalDocumentKey } from "@platform/site-data";
import legalDocumentManifest from "../../../config/legal-document-manifest.json";
import { exactLegalDocumentLocale, type LegalDocumentLocale } from "./locale-model";

export type LegalDocumentSource = {
  documentKey: LegalDocumentKey;
  locale: "de" | "en";
  version: string;
  eyebrow: string;
  title: string;
  sections: Array<{ title: string; body: string }>;
};

const sources: LegalDocumentSource[] = [
  {
    documentKey: "terms", locale: "de", version: "2026-08-24-b2b-draft-1",
    eyebrow: "B2B-Vertragsbedingungen", title: "Allgemeine Geschäftsbedingungen",
    sections: [
      { title: "1. Anbieter, B2B-Beschränkung und Prüfstatus", body: "Diese Bedingungen gelten für BusinessSite-Abonnements des in der Anbieterkennzeichnung genannten Plattformbetreibers. Das Angebot richtet sich ausschließlich an Unternehmen und selbständig beruflich Tätige, die beim Vertragsschluss in Ausübung ihrer gewerblichen oder selbständigen beruflichen Tätigkeit handeln. Die Selbstauskunft im Checkout ersetzt keine rechtliche Statusprüfung. Dieser Text ist ein Betriebsentwurf und erfordert professionelle rechtliche Prüfung." },
      { title: "2. Leistung", body: "Der Starter-Tarif umfasst ausschließlich die im Produktkatalog und unmittelbar vor der Bestellung als aktiv bezeichneten Funktionen. Terminfunktionen sind Anfragen und kein Echtzeit-Buchungskalender. Nicht aktive Pläne, Social Media Studio und sonstige als geplant bezeichnete Funktionen sind nicht Vertragsbestandteil." },
      { title: "3. Testphase und Vertragsschluss", body: "Die private Testphase ist zeitlich befristet. Ein kostenpflichtiges Abonnement wird nicht durch die Erfolgsseite, sondern erst durch die bestätigte Verarbeitung des Zahlungsanbieters aktiviert. Maßgeblich sind die vor der Bestellung gezeigten Tarif-, Preis-, Steuer- und Vertragsinformationen." },
      { title: "4. Preis, Steuerdarstellung und Zahlung", body: "Preis, Währung, Abrechnungsintervall und die konfigurierte Steuerdarstellung werden vor dem Checkout angezeigt. Die steuerliche Behandlung und Rechnungsbereitstellung richten sich nach der vom Plattformbetreiber geprüften Zahlungs- und Steuerkonfiguration. Die Software berechnet keine eigenständige Umsatzsteuer und erteilt keine Steuerberatung." },
      { title: "5. Laufzeit, automatische Verlängerung und Kündigung", body: "Das Starter-Abonnement wird monatlich abgerechnet und verlängert sich jeweils um einen weiteren Abrechnungszeitraum, sofern es nicht gekündigt wird. Eine Kündigung wirkt zum Ende des bereits bezahlten Zeitraums; bis dahin bleibt der vereinbarte Zugriff erhalten." },
      { title: "6. Zugriff nach Zahlungsstörung oder Vertragsende", body: "Bei überfälliger Zahlung gilt zunächst die angezeigte Zahlungsfrist. Danach wird die Website privat und der Kundenbereich für den dokumentierten Zeitraum schreibgeschützt. Nach Ablauf dieses Zeitraums ist der normale Inhaltszugriff gesperrt. Dieses Release löscht dabei keine Daten zahlender Kunden automatisch; endgültige Aufbewahrungs- und Löschregeln bleiben gesondert festzulegen." },
      { title: "7. Kundeninhalte und Unternehmensangaben", body: "Der Kunde ist für die Richtigkeit seiner Unternehmens-, Kontakt- und öffentlichen Rechtstexte sowie für erforderliche Rechte an Inhalten und Medien verantwortlich. Der Plattformbetreiber wird dadurch nicht zum Betreiber oder Inhaber des Kundenunternehmens." },
      { title: "8. Datenschutz und Anbieter", body: "Die Verarbeitung personenbezogener Daten wird in der Datenschutzerklärung beschrieben. Zahlungen werden über den im Checkout genannten Anbieter verarbeitet. Support- und rechtliche Kontaktwege ergeben sich aus den jeweils aktiven Plattforminformationen." },
    ],
  },
  {
    documentKey: "terms", locale: "en", version: "2026-08-24-b2b-draft-1",
    eyebrow: "B2B contract terms", title: "Terms and conditions",
    sections: [
      { title: "1. Supplier, B2B restriction and review status", body: "These terms apply to BusinessSite subscriptions supplied by the platform operator identified in the legal notice. The offer is solely for businesses and self-employed professionals acting for their commercial or independent professional activity. Checkout self-attestation is not legal verification. This operational draft requires professional legal review." },
      { title: "2. Service", body: "Starter includes only capabilities shown as active in the product catalogue and immediately before purchase. Appointment functionality records requests; it is not a real-time booking calendar. Planned plans and disabled add-ons are not included." },
      { title: "3. Trial and contract formation", body: "The private trial is time limited. A paid subscription is activated only after verified payment-provider confirmation, never merely by the success page. The plan, price, tax and contract information shown before checkout applies." },
      { title: "4. Price, tax display and payment", body: "Price, currency, billing interval and the configured tax presentation are shown before checkout. Tax treatment and invoicing depend on the operator-reviewed payment and tax configuration. The software does not independently calculate VAT or provide tax advice." },
      { title: "5. Term, automatic renewal and cancellation", body: "Starter is billed monthly and renews for another billing period unless cancelled. Cancellation takes effect at the end of the paid period; contracted access continues until then." },
      { title: "6. Access after payment failure or contract end", body: "A configured payment-recovery period applies first. The website then becomes private and the customer area read-only for the documented period, followed by locked normal content access. This release does not automatically delete paid-customer data; final retention and deletion rules remain a separate decision." },
      { title: "7. Customer content and business information", body: "The customer is responsible for accurate business, contact and public legal information and for rights to its content and media. The platform operator does not become the owner or operator of the customer business." },
      { title: "8. Privacy and providers", body: "Personal-data processing is described in the privacy notice. Payments are handled by the provider named at checkout. Support and legal contact channels are stated in the active platform information." },
    ],
  },
  {
    documentKey: "privacy", locale: "de", version: "2026-08-24-art13-draft-1",
    eyebrow: "Datenschutzinformation", title: "Datenschutzerklärung",
    sections: [
      { title: "1. Verantwortlicher und Kontakt", body: "Verantwortlicher für die Plattform ist der in der aktiven Anbieterkennzeichnung genannte Plattformbetreiber. Rechtlicher Kontakt, Anschrift und gegebenenfalls weitere verantwortliche Stellen werden dort getrennt von Support- und Infrastrukturkontakten ausgewiesen." },
      { title: "2. Zwecke und Rechtsgrundlagen", body: "Daten aus Testphase, Konto, Checkout, Website-Verwaltung, Sicherheitsprotokollen und Support werden für vorvertragliche Maßnahmen, Vertragserfüllung, gesetzliche Pflichten sowie den sicheren Betrieb verarbeitet. Eine bloße Kenntnisnahme dieser Information wird nicht als allgemeine Einwilligung bezeichnet." },
      { title: "3. Kategorien von Empfängern", body: "Je nach aktivierter Funktion können Hosting- und Datenbankanbieter, Objektspeicher, Zahlungsanbieter, E-Mail-Dienstleister, Karten-/Finder-Anbieter und konfigurierte KI-Anbieter Daten als erforderliche Empfänger oder Auftragsverarbeiter erhalten. Deaktivierte Anbieter werden nicht allein aufgrund dieses Textes eingesetzt." },
      { title: "4. Internationale Übermittlungen", body: "Soweit ein konfigurierter Anbieter Daten außerhalb des EWR verarbeitet, muss der Plattformbetreiber die anwendbare Grundlage und geeignete Garantien prüfen und in der finalen Information konkretisieren. Diese Software nimmt diese Prüfung nicht automatisch vor." },
      { title: "5. Speicherdauer", body: "Daten werden nach den für Testphase, Vertrag, Sicherheit und gesetzliche Pflichten festgelegten Fristen gespeichert. Abgelaufene, nicht aktivierte Demos können nach dem konfigurierten Recovery-Fenster bereinigt werden. Vollständige Export-, Lösch- und Retention-Automation ist noch nicht implementiert." },
      { title: "6. Rechte und Beschwerde", body: "Betroffene Personen können nach Maßgabe der DSGVO Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit oder Widerspruch verlangen und sich bei einer zuständigen Datenschutzaufsichtsbehörde beschweren. Der endgültige Beschwerdekontakt muss vom Betreiber konfiguriert werden." },
      { title: "7. Pflichtangaben und Folgen der Nichtbereitstellung", body: "Als erforderlich markierte Konto-, Unternehmens- und Checkout-Felder sind für die Testphase, Authentifizierung oder den Vertragsschluss notwendig. Ohne diese Angaben kann der jeweilige Vorgang nicht durchgeführt werden. VAT ID und ausdrücklich optionale Felder sind nicht allgemein erforderlich." },
      { title: "8. Automatisierte Entscheidungen", body: "Dieses Release trifft keine ausschließlich automatisierte Entscheidung mit rechtlicher oder ähnlich erheblicher Wirkung über den B2B-Status. Auffällige Angaben können lediglich eine manuelle Prüfung auslösen." },
    ],
  },
  {
    documentKey: "privacy", locale: "en", version: "2026-08-24-art13-draft-1",
    eyebrow: "Privacy information", title: "Privacy notice",
    sections: [
      { title: "1. Controller and contact", body: "The controller for the platform is the operator identified in the active legal notice. Legal contact, address and any other responsible roles are kept separate from support and infrastructure contacts." },
      { title: "2. Purposes and legal bases", body: "Trial, account, checkout, site-management, security-log and support data are processed for pre-contract steps, contract performance, legal obligations and secure operation. Acknowledging this notice is not described as general consent." },
      { title: "3. Recipient categories", body: "Depending on enabled features, hosting/database providers, object storage, payment providers, transactional email, maps/finder and configured AI providers may receive necessary data. A disabled provider is not engaged merely because this notice names a category." },
      { title: "4. International transfers", body: "Where a configured provider processes data outside the EEA, the operator must assess and document the applicable transfer basis and safeguards. The software does not perform that legal assessment automatically." },
      { title: "5. Retention", body: "Data is retained according to configured trial, contract, security and legal-obligation criteria. Expired unactivated demos may be cleaned up after the recovery window. Complete export, deletion and retention automation is not yet implemented." },
      { title: "6. Rights and complaints", body: "Subject to the GDPR, individuals may request access, correction, deletion, restriction or portability, object to processing and complain to a competent supervisory authority. The operator must configure the final complaint contact." },
      { title: "7. Required fields", body: "Fields marked required are necessary for the relevant trial, authentication or contract workflow. The process cannot continue without them. A VAT ID and fields expressly marked optional are not generally required." },
      { title: "8. Automated decisions", body: "This release does not make a solely automated decision with legal or similarly significant effect about B2B status. Inconsistent data may only flag a manual review." },
    ],
  },
  {
    documentKey: "imprint", locale: "de", version: "2026-08-24-ddg5-draft-1",
    eyebrow: "Anbieterkennzeichnung", title: "Impressum",
    sections: [{ title: "Konfigurationsgebundene Angaben", body: "Name, ladungsfähige Anschrift, Rechtsform und Vertretung, elektronische Kontaktmöglichkeit, Register, Aufsichtsbehörde und Umsatzsteuer-ID werden nur angezeigt, wenn sie für den Plattformbetreiber konfiguriert und anwendbar sind. Eine private Steuernummer wird nicht automatisch veröffentlicht." }],
  },
  {
    documentKey: "imprint", locale: "en", version: "2026-08-24-ddg5-draft-1",
    eyebrow: "Provider information", title: "Legal notice",
    sections: [{ title: "Configuration-bound information", body: "Name, service address, legal form and representation, electronic contact, register, supervisory authority and VAT ID are shown only when configured and applicable to the platform operator. A private tax number is not published automatically." }],
  },
  {
    documentKey: "cancellation", locale: "de", version: "2026-08-24-b2b-cancel-draft-1",
    eyebrow: "B2B-Abonnement", title: "Kündigung und Vertragsende",
    sections: [
      { title: "Abonnement verwalten", body: "Authentifizierte Geschäftskunden verwalten das Abonnement über den Kundenbereich und den freigegebenen Zahlungsanbieter. Eine Kündigung wirkt zum Ende des laufenden bezahlten Abrechnungszeitraums." },
      { title: "Zugriffsfolgen", body: "Bis zum wirksamen Ende bleibt der volle Zugriff bestehen. Danach wird die Website privat und der Kundenbereich für 30 Tage schreibgeschützt; anschließend wird normaler Inhaltszugriff gesperrt. Billing-Recovery und sichere Kontofunktionen bleiben nach der dokumentierten Policy verfügbar." },
      { title: "Alternativer Kontakt", body: "Ist der Kontozugriff nicht möglich, kann der Geschäftskunde den konfigurierten rechtlichen Kontakt verwenden. Die Anfrage muss die Zuordnung zum Vertrag ermöglichen, ohne Passwörter oder Zahlungsdaten zu übermitteln." },
    ],
  },
  {
    documentKey: "cancellation", locale: "en", version: "2026-08-24-b2b-cancel-draft-1",
    eyebrow: "B2B subscription", title: "Cancellation and contract end",
    sections: [
      { title: "Manage the subscription", body: "Authenticated business customers manage the subscription through the customer area and approved payment provider. Cancellation takes effect at the end of the current paid billing period." },
      { title: "Access effects", body: "Full access continues until the effective end. The site then becomes private and the customer area remains read-only for 30 days, followed by locked normal content access. Billing recovery and secure account functions follow the documented policy." },
      { title: "Alternative contact", body: "If account access is unavailable, the business customer may use the configured legal contact. The request must permit contract matching without sending passwords or payment data." },
    ],
  },
];

export function legalDocumentSource(documentKey: LegalDocumentKey, requestedLocale: LegalDocumentLocale) {
  const source = sources.find((item) => item.documentKey === documentKey && item.locale === requestedLocale);
  if (!source) throw new Error(`Legal source unavailable for ${documentKey}:${requestedLocale}.`);
  return source;
}

export function legalDocumentEvidence(documentKey: LegalDocumentKey, locale: string) {
  const exactLocale = exactLegalDocumentLocale(locale);
  if (!exactLocale) throw new Error(`Unsupported legal document locale: ${locale}.`);
  const source = legalDocumentSource(documentKey, exactLocale);
  const canonical = JSON.stringify({
    documentKey: source.documentKey, locale: source.locale, version: source.version,
    eyebrow: source.eyebrow, title: source.title, sections: source.sections,
  });
  const evidence = {
    documentKey: source.documentKey,
    locale: source.locale,
    version: source.version,
    contentHash: createHash("sha256").update(canonical).digest("hex"),
  };
  const manifested = legalDocumentManifest.find((item) => item.documentKey === evidence.documentKey && item.locale === evidence.locale);
  if (!manifested || manifested.version !== evidence.version || manifested.contentHash !== evidence.contentHash)
    throw new Error(`Legal source manifest mismatch for ${evidence.documentKey}:${evidence.locale}; create and review a new version.`);
  return evidence;
}

export function developmentCheckoutDocuments(locale: LegalDocumentLocale): CheckoutDocumentEvidence[] {
  return [legalDocumentEvidence("terms", locale), legalDocumentEvidence("privacy", locale)] as CheckoutDocumentEvidence[];
}

export async function legalDocumentReviewState(documentKey: LegalDocumentKey, locale: LegalDocumentLocale) {
  const evidence = legalDocumentEvidence(documentKey, locale);
  try {
    const documents = await new PostgresLegalRepository({ boundary: "runtime" }).listDocuments();
    const active = documents.find((document) => document.documentKey === evidence.documentKey &&
      document.locale === evidence.locale && document.version === evidence.version &&
      document.contentHash === evidence.contentHash && document.status === "active");
    return { evidence, reviewed: Boolean(active), active };
  } catch {
    return { evidence, reviewed: false, active: undefined };
  }
}

export const legalDocumentSources = Object.freeze(sources);
