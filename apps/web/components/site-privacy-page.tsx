import type { SiteDocument, SupportedLocale } from "@platform/website-engine";
import { resolveLocale } from "@platform/website-engine";
import { platformConfig } from "../lib/platform-config";

type PrivacyCopy = {
  eyebrow: string;
  title: string;
  controllerIntro: (name: string) => string;
  identityHeading: string;
  dataHeading: string;
  dataBody: string;
  dataFields: string;
  platformHeading: string;
  platformBody: string;
  platformLink: string;
  contactHeading: string;
};

const privacyCopyFor = (platform: string): Record<SupportedLocale, PrivacyCopy> => ({
  de: {
    eyebrow: "Datenschutz",
    title: "Datenschutzhinweise",
    controllerIntro: (name) => `${name} ist für die Daten verantwortlich, die über diese Website erhoben werden.`,
    identityHeading: "Verantwortliche Stelle",
    dataHeading: "Welche Daten diese Website erhebt",
    dataBody: "Wenn Sie eine Terminanfrage über diese Website senden, werden Ihre Angaben an das Unternehmen übermittelt und dort zur Bearbeitung Ihrer Anfrage gespeichert.",
    dataFields: "Name, Telefonnummer, E-Mail-Adresse, gewählte Leistung, Wunschtermin, Wunschzeit und Ihre Nachricht.",
    platformHeading: "Plattform",
    platformBody: `Der technische Betrieb dieser Website erfolgt durch ${platform}. Informationen zur Verarbeitung technischer Daten finden Sie in der Plattform-Datenschutzerklärung.`,
    platformLink: "Plattform-Datenschutzerklärung",
    contactHeading: "Kontakt",
  },
  en: {
    eyebrow: "Privacy",
    title: "Privacy notice",
    controllerIntro: (name) => `${name} is responsible for the data collected through this website.`,
    identityHeading: "Who is responsible",
    dataHeading: "What this website collects",
    dataBody: "When you send an appointment request through this website, your details are transmitted to the business and stored there to handle your request.",
    dataFields: "Name, phone number, email address, selected service, preferred date, preferred time and your message.",
    platformHeading: "Platform",
    platformBody: `This website is operated technically by ${platform}. See the platform privacy notice for how technical data is processed.`,
    platformLink: "Platform privacy notice",
    contactHeading: "Contact",
  },
  fr: {
    eyebrow: "Confidentialité",
    title: "Politique de confidentialité",
    controllerIntro: (name) => `${name} est responsable des données collectées via ce site.`,
    identityHeading: "Responsable",
    dataHeading: "Ce que ce site collecte",
    dataBody: "Lorsque vous envoyez une demande de rendez-vous via ce site, vos informations sont transmises à l'entreprise et conservées par celle-ci pour traiter votre demande.",
    dataFields: "Nom, numéro de téléphone, adresse e-mail, service choisi, date souhaitée, heure souhaitée et votre message.",
    platformHeading: "Plateforme",
    platformBody: `L'exploitation technique de ce site est assurée par ${platform}. Consultez la politique de confidentialité de la plateforme pour le traitement des données techniques.`,
    platformLink: "Politique de confidentialité de la plateforme",
    contactHeading: "Contact",
  },
  es: {
    eyebrow: "Privacidad",
    title: "Aviso de privacidad",
    controllerIntro: (name) => `${name} es responsable de los datos recopilados a través de este sitio.`,
    identityHeading: "Responsable",
    dataHeading: "Qué recopila este sitio",
    dataBody: "Cuando envías una solicitud de cita a través de este sitio, tus datos se transmiten al negocio y se guardan allí para gestionar tu solicitud.",
    dataFields: "Nombre, número de teléfono, correo electrónico, servicio seleccionado, fecha preferida, hora preferida y tu mensaje.",
    platformHeading: "Plataforma",
    platformBody: `El funcionamiento técnico de este sitio corre a cargo de ${platform}. Consulta el aviso de privacidad de la plataforma para el tratamiento de datos técnicos.`,
    platformLink: "Aviso de privacidad de la plataforma",
    contactHeading: "Contacto",
  },
  it: {
    eyebrow: "Privacy",
    title: "Informativa sulla privacy",
    controllerIntro: (name) => `${name} è responsabile dei dati raccolti tramite questo sito.`,
    identityHeading: "Titolare",
    dataHeading: "Cosa raccoglie questo sito",
    dataBody: "Quando invii una richiesta di appuntamento tramite questo sito, i tuoi dati vengono trasmessi all'attività e conservati da essa per gestire la richiesta.",
    dataFields: "Nome, numero di telefono, indirizzo e-mail, servizio selezionato, data preferita, orario preferito e il tuo messaggio.",
    platformHeading: "Piattaforma",
    platformBody: `L'esercizio tecnico di questo sito è gestito da ${platform}. Consulta l'informativa sulla privacy della piattaforma per il trattamento dei dati tecnici.`,
    platformLink: "Informativa sulla privacy della piattaforma",
    contactHeading: "Contatti",
  },
  sq: {
    eyebrow: "Privatësia",
    title: "Njoftimi i privatësisë",
    controllerIntro: (name) => `${name} është përgjegjës për të dhënat që mblidhen përmes kësaj faqeje.`,
    identityHeading: "Kush është përgjegjës",
    dataHeading: "Çfarë mbledh kjo faqe",
    dataBody: "Kur dërgoni një kërkesë takimi përmes kësaj faqeje, të dhënat tuaja u përcillen biznesit dhe ruhen aty për të trajtuar kërkesën tuaj.",
    dataFields: "Emri, numri i telefonit, adresa e emailit, shërbimi i zgjedhur, data e preferuar, ora e preferuar dhe mesazhi juaj.",
    platformHeading: "Platforma",
    platformBody: `Funksionimi teknik i kësaj faqeje sigurohet nga ${platform}. Shihni njoftimin e privatësisë të platformës për mënyrën e trajtimit të të dhënave teknike.`,
    platformLink: "Njoftimi i privatësisë i platformës",
    contactHeading: "Kontakt",
  },
});

function legalLine(site: SiteDocument) {
  const legal = site.publicLegal;
  return [
    legal?.legalBusinessName,
    [legal?.street, [legal?.postalCode, legal?.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    legal?.countryCode,
    legal?.contactEmail,
  ].filter(Boolean).join(" · ");
}

/**
 * The platform-generated customer privacy page. Customer-owned identity, the
 * data the site actually collects (the appointment request form), and a link
 * to the platform notice for platform-side processing.
 */
export function SitePrivacyPage({
  site,
  platformPrivacyHref = "/legal/privacy",
}: {
  site: SiteDocument;
  platformPrivacyHref?: string;
}) {
  const locale = resolveLocale(site.locale);
  const copy = privacyCopyFor(platformConfig.brand.name)[locale];
  const identity = legalLine(site);
  return (
    <main className="site-privacy-page" lang={locale}>
      <header className="site-privacy-header">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{site.content.name} — {copy.title}</h1>
      </header>
      <section className="site-privacy-section">
        <h2>{copy.identityHeading}</h2>
        <p>{copy.controllerIntro(site.content.name)}</p>
        {identity ? <p>{identity}</p> : null}
      </section>
      <section className="site-privacy-section">
        <h2>{copy.dataHeading}</h2>
        <p>{copy.dataBody}</p>
        <p>{copy.dataFields}</p>
      </section>
      <section className="site-privacy-section">
        <h2>{copy.platformHeading}</h2>
        <p>{copy.platformBody}</p>
        <p><a href={platformPrivacyHref} target="_blank" rel="noreferrer">{copy.platformLink}</a></p>
      </section>
      {site.publicLegal?.contactEmail ? (
        <section className="site-privacy-section">
          <h2>{copy.contactHeading}</h2>
          <p><a href={`mailto:${site.publicLegal.contactEmail}`}>{site.publicLegal.contactEmail}</a></p>
        </section>
      ) : null}
    </main>
  );
}
