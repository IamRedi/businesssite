import type { PlatformLocale } from "./platform-config";

export const b2bContractVersions = Object.freeze({
  b2bAttestation: "b2b-business-use-v1",
  authorityAttestation: "contracting-authority-v1",
  automaticRenewal: "starter-monthly-renewal-v1",
  privacyAcknowledgement: "privacy-notice-ack-v1",
  launchPromotion: "launch-promotion-normal-price-v1",
});

const en = {
  restriction: "For businesses and self-employed professionals only.",
  businessUse: "I act for a business or independent professional activity and am not purchasing as a consumer.",
  authority: "I am authorised to bind the business identified above to this subscription.",
  terms: "I accept the B2B Terms.",
  renewal: "I acknowledge monthly billing and automatic renewal until cancellation, which takes effect at the end of the paid period.",
  privacy: "I acknowledge the Privacy Notice. This acknowledgement is not general consent to data processing.",
  promotion: "I acknowledge the promotion duration and that the normal displayed monthly price applies afterward unless cancelled.",
  legalName: "Legal/business name",
  country: "Country code",
  businessType: "Business type",
  vatId: "VAT ID (optional; not provider-verified)",
};

export type B2BLaunchCopy = typeof en;

export function b2bLaunchCopy(locale: PlatformLocale): B2BLaunchCopy {
  if (locale === "de") return {
    restriction: "Nur für Unternehmen und selbständig beruflich Tätige.",
    businessUse: "Ich handle für ein Unternehmen oder eine selbständige berufliche Tätigkeit und kaufe nicht als Verbraucher.",
    authority: "Ich bin berechtigt, das oben bezeichnete Unternehmen an dieses Abonnement zu binden.",
    terms: "Ich akzeptiere die B2B-AGB.",
    renewal: "Ich bestätige monatliche Abrechnung und automatische Verlängerung bis zur Kündigung, die zum Ende des bezahlten Zeitraums wirkt.",
    privacy: "Ich bestätige die Kenntnisnahme der Datenschutzinformation. Dies ist keine allgemeine Einwilligung in die Datenverarbeitung.",
    promotion: "Ich bestätige die Aktionsdauer und den danach geltenden regulären angezeigten Monatspreis, sofern nicht gekündigt wird.",
    legalName: "Rechtlicher Unternehmensname",
    country: "Ländercode",
    businessType: "Unternehmensform",
    vatId: "USt-IdNr. (optional; nicht extern verifiziert)",
  };
  return en;
}
