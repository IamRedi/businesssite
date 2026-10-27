import type { PlatformLocale } from "./platform-config";

export type LaunchOfferCopy = {
  eyebrow: string;
  title: string;
  body: string;
  setup: string;
  freeMonths: string;
  priceTitle: string;
  currency: string;
};

export const launchOfferCopy: Record<PlatformLocale, LaunchOfferCopy> = {
  de: { eyebrow: "Einführungsangebot", title: "Ihre Website in etwa 2 Minuten starten.", body: "Erstellen Sie zuerst Ihre private kostenlose Demo. Beim Startangebot entfällt die einmalige Einrichtung, danach sind die ersten zwei Monate kostenlos.", setup: "Einrichtung", freeMonths: "2 Monate kostenlos nach der Demo", priceTitle: "Monatliche Pakete", currency: "Währung" },
  en: { eyebrow: "Launch offer", title: "Create your website in about 2 minutes.", body: "Start with your private free trial. The launch offer waives the one-time setup and includes the first two months free after the trial.", setup: "Setup", freeMonths: "2 months free after the trial", priceTitle: "Monthly plans", currency: "Currency" },
  fr: { eyebrow: "Offre de lancement", title: "Créez votre site en environ 2 minutes.", body: "Commencez par votre démo privée gratuite. L’offre de lancement supprime les frais de mise en place et offre les deux premiers mois après la démo.", setup: "Mise en place", freeMonths: "2 mois offerts après la démo", priceTitle: "Forfaits mensuels", currency: "Devise" },
  es: { eyebrow: "Oferta de lanzamiento", title: "Crea tu sitio web en unos 2 minutos.", body: "Empieza con tu demo privada gratuita. La oferta elimina la puesta en marcha y ofrece los dos primeros meses después de la demo.", setup: "Configuración", freeMonths: "2 meses gratis después de la demo", priceTitle: "Planes mensuales", currency: "Moneda" },
  it: { eyebrow: "Offerta di lancio", title: "Crea il tuo sito in circa 2 minuti.", body: "Inizia con la demo privata gratuita. L’offerta elimina il costo di attivazione e include i primi due mesi gratuiti dopo la demo.", setup: "Attivazione", freeMonths: "2 mesi gratuiti dopo la demo", priceTitle: "Piani mensili", currency: "Valuta" },
  sq: { eyebrow: "Ofertë fillestare", title: "Krijo website-in tënd në rreth 2 minuta.", body: "Filloni me provën private falas. Oferta fillestare heq pagesën njëherëshe të aktivizimit dhe përfshin 2 muaj falas pas provës.", setup: "Aktivizimi", freeMonths: "2 muaj falas pas provës", priceTitle: "Paketat mujore", currency: "Monedha" },
};

export function launchSetupPrices(currency: "EUR" | "USD" | "ALL") {
  return currency === "EUR" ? { regular: "€150", launch: "€0" } : currency === "USD" ? { regular: "$150", launch: "$0" } : { regular: "10,000 ALL", launch: "0 ALL" };
}
