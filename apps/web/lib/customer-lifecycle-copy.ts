import type { CustomerUiLocale } from "./locale-model";

export const customerErrorCodes = [
  "invalid_request", "rate_limited", "trial_conflict", "trial_unavailable",
  "checkout_unavailable", "legal_locale_unavailable", "provider_unavailable",
  "appointment_unavailable", "quota_reached", "not_found",
  "legal_identity_incomplete", "unknown",
] as const;
export type CustomerErrorCode = (typeof customerErrorCodes)[number];

const en = {
  languageName: "English",
  common: { privacy: "Privacy notice", terms: "Terms", back: "Back", retry: "Try again", comingSoon: "Coming soon", preview: "Preview" },
  errors: {
    invalid_request: "Please check the information and try again.", rate_limited: "Too many requests. Please try again later.",
    trial_conflict: "A trial cannot be created with these details.", trial_unavailable: "The trial could not be created.",
    checkout_unavailable: "Secure checkout is currently unavailable.", legal_locale_unavailable: "Checkout is unavailable until reviewed English legal documents are active.",
    legal_identity_incomplete: "Complete Legal Identity before subscribing: open your site editor and save every required legal field first.",
    provider_unavailable: "The service provider is currently unavailable.", appointment_unavailable: "The appointment request could not be sent.",
    quota_reached: "This website is receiving many requests. Please try again later.", not_found: "The requested item was not found.",
    unknown: "Something went wrong. Please try again.",
  },
  lifecycle: {
    full: { title: "Full access", body: "Your website and editor are available." },
    payment_grace: { title: "Payment recovery period", body: "Your website and basic editing remain available until {date}. AI, media uploads and domain changes are paused. Update billing before the deadline." },
    read_only: { title: "Read-only access", body: "Your website is private and changes are disabled until {date}. Saved data is not deleted immediately. Use billing recovery to restore access." },
    expired_trial: { title: "Trial expired", body: "The private trial has ended. Content remains recoverable until {date}; activate Starter to continue." },
    locked: { title: "Account content locked", body: "The website is private and normal content access is locked. Security and billing recovery remain available. Data is not promised to be retained permanently." },
    never_activated: { title: "Subscription required", body: "This website was never activated. Start a Starter subscription to publish it." },
    billingRecovery: "Open billing recovery", reactivate: "Reactivate Starter", savedContent: "Saved website content",
    savedContentBody: "Content, media, domain records and appointment-request history remain stored during the documented access window.",
    accountAccess: "Account access",
  },
  appointment: { request: "Appointment request", preferredDate: "Preferred date", preferredTime: "Preferred time", confirmation: "The business confirms personally." },
  security: { recoveryPrivacy: "Your email is used to process this recovery request.", resetPrivacy: "Security data is processed to complete this recovery.", install: "Install app" },
  checkout: { company: "Company / legal entity", soleProprietor: "Sole proprietor / self-employed", otherBusiness: "Other business organization", termsLink: "Terms", privacyLink: "Privacy Notice", cancellation: "Monthly subscription. Cancellation takes effect at the end of the paid period.", taxUnavailable: "Tax display requires reviewed operator configuration." },
  editor: {
    preview: "Preview", social: "Social Media", mediaPaused: "New media uploads and media changes are unavailable during payment recovery.",
    legalEyebrow: "Public legal identity", legalTitle: "Customer website legal notice", legalBody: "These fields belong to your business. Platform operator details are never copied here. Required production fields must be complete before publication.",
    legalLabels: ["Legal/business name", "Legal form (when applicable)", "Authorised representative (when applicable)", "Street and number", "Postal code", "City", "Country code", "Legal contact email", "Register (when applicable)", "Register number (when applicable)", "VAT ID (when applicable)", "Customer privacy notice URL"],
    legalIncompleteTitle: "Complete Legal Identity before publishing", legalIncompleteBody: "This website is not publicly visible while required legal identity fields are missing. Open the Contact section and save every required field.", legalIncompleteMissing: "Missing required fields", legalSaveBlocked: "Public websites must keep a complete legal identity. Fill every required legal field before saving this section.", privacyInternal: "Use the platform privacy page (automatic)", privacyExternal: "Use an external privacy URL (explicit override)",
  },
} as const;

type DeepWiden<T> = T extends string
  ? string
  : T extends readonly unknown[]
    ? { [K in keyof T]: DeepWiden<T[K]> }
    : T extends Record<string, unknown>
      ? { [K in keyof T]: DeepWiden<T[K]> }
      : T;
export type CustomerLifecycleCopy = DeepWiden<typeof en>;

const de: CustomerLifecycleCopy = {
  languageName: "Deutsch",
  common: { privacy: "Datenschutzhinweise", terms: "AGB", back: "Zurück", retry: "Erneut versuchen", comingSoon: "Demnächst", preview: "Vorschau" },
  errors: {
    invalid_request: "Bitte prüfen Sie Ihre Angaben und versuchen Sie es erneut.", rate_limited: "Zu viele Anfragen. Bitte versuchen Sie es später erneut.",
    trial_conflict: "Mit diesen Angaben kann keine Testphase erstellt werden.", trial_unavailable: "Die Testphase konnte nicht erstellt werden.",
    checkout_unavailable: "Der sichere Checkout ist derzeit nicht verfügbar.", legal_locale_unavailable: "Der Checkout ist nicht verfügbar, bis geprüfte deutsche Rechtstexte aktiv sind.",
    legal_identity_incomplete: "Vervollständigen Sie die rechtliche Identität vor dem Abschluss: Öffnen Sie Ihren Website-Editor und speichern Sie zuerst alle Pflichtfelder.",
    provider_unavailable: "Der Dienstanbieter ist derzeit nicht verfügbar.", appointment_unavailable: "Die Terminanfrage konnte nicht gesendet werden.",
    quota_reached: "Diese Website erhält derzeit viele Anfragen. Bitte versuchen Sie es später erneut.", not_found: "Der angeforderte Inhalt wurde nicht gefunden.",
    unknown: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
  },
  lifecycle: {
    full: { title: "Vollzugriff", body: "Ihre Website und der Editor sind verfügbar." },
    payment_grace: { title: "Frist zur Zahlungsklärung", body: "Website und grundlegende Bearbeitung bleiben bis {date} verfügbar. KI, Medien-Uploads und Domainänderungen sind pausiert. Aktualisieren Sie die Zahlung vor Fristende." },
    read_only: { title: "Schreibgeschützter Zugriff", body: "Ihre Website ist privat und Änderungen sind bis {date} gesperrt. Gespeicherte Daten werden nicht sofort gelöscht. Stellen Sie den Zugriff über die Zahlungsklärung wieder her." },
    expired_trial: { title: "Testphase abgelaufen", body: "Die private Testphase ist beendet. Inhalte bleiben bis {date} wiederherstellbar; aktivieren Sie Starter, um fortzufahren." },
    locked: { title: "Inhaltszugriff gesperrt", body: "Die Website ist privat und der normale Inhaltszugriff gesperrt. Sicherheit und Zahlungsklärung bleiben verfügbar. Eine dauerhafte Aufbewahrung wird nicht zugesagt." },
    never_activated: { title: "Abonnement erforderlich", body: "Diese Website wurde nie aktiviert. Starten Sie Starter, um sie zu veröffentlichen." },
    billingRecovery: "Zahlung klären", reactivate: "Starter reaktivieren", savedContent: "Gespeicherte Website-Inhalte",
    savedContentBody: "Inhalte, Medien, Domainangaben und Terminanfragen bleiben während des dokumentierten Zugriffsfensters gespeichert.",
    accountAccess: "Kontozugriff",
  },
  appointment: { request: "Terminanfrage", preferredDate: "Gewünschtes Datum", preferredTime: "Gewünschte Uhrzeit", confirmation: "Der Betrieb bestätigt den Termin persönlich." },
  security: { recoveryPrivacy: "Ihre E-Mail wird zur Bearbeitung dieser Wiederherstellungsanfrage verwendet.", resetPrivacy: "Sicherheitsdaten werden zur Wiederherstellung verarbeitet.", install: "App installieren" },
  checkout: { company: "Unternehmen / juristische Person", soleProprietor: "Einzelunternehmen / selbständig tätig", otherBusiness: "Andere geschäftliche Organisation", termsLink: "AGB", privacyLink: "Datenschutzhinweise", cancellation: "Monatliches Abonnement. Eine Kündigung wirkt zum Ende des bezahlten Zeitraums.", taxUnavailable: "Die Steuerdarstellung erfordert eine geprüfte Betreiberkonfiguration." },
  editor: {
    preview: "Vorschau", social: "Social Media", mediaPaused: "Neue Medien-Uploads und Änderungen an Medien sind während der Zahlungsklärung nicht verfügbar.",
    legalEyebrow: "Öffentliche rechtliche Identität", legalTitle: "Rechtliche Angaben der Kunden-Website", legalBody: "Diese Felder gehören zu Ihrem Unternehmen. Angaben des Plattformbetreibers werden nie hierher kopiert. Erforderliche Produktionsangaben müssen vor der Veröffentlichung vollständig sein.",
    legalLabels: ["Rechtlicher/Geschäftsname", "Rechtsform (falls zutreffend)", "Vertretungsberechtigte Person (falls zutreffend)", "Straße und Hausnummer", "Postleitzahl", "Ort", "Ländercode", "Rechtliche Kontakt-E-Mail", "Register (falls zutreffend)", "Registernummer (falls zutreffend)", "USt-IdNr. (falls zutreffend)", "URL der Kundendatenschutzhinweise"],
    legalIncompleteTitle: "Rechtliche Identität vor der Veröffentlichung vervollständigen", legalIncompleteBody: "Diese Website ist nicht öffentlich sichtbar, solange Pflichtfelder der rechtlichen Identität fehlen. Öffnen Sie den Bereich Kontakt und speichern Sie alle Pflichtfelder.", legalIncompleteMissing: "Fehlende Pflichtfelder", legalSaveBlocked: "Öffentliche Websites benötigen eine vollständige rechtliche Identität. Bitte füllen Sie alle Pflichtfelder aus, bevor Sie diesen Bereich speichern.", privacyInternal: "Die Plattform-Datenschutzseite verwenden (automatisch)", privacyExternal: "Eine externe Datenschutz-URL verwenden (ausdrücklicher Override)",
  },
};

export const customerLifecycleCopy = { en, de } satisfies Record<CustomerUiLocale, CustomerLifecycleCopy>;

export function localizedCustomerError(locale: CustomerUiLocale, code: unknown) {
  return customerLifecycleCopy[locale].errors[customerErrorCodes.includes(code as CustomerErrorCode) ? code as CustomerErrorCode : "unknown"];
}

type LifecycleStateCopyKey = "full" | "payment_grace" | "read_only" | "expired_trial" | "locked" | "never_activated";

export function lifecycleMessage(locale: CustomerUiLocale, state: LifecycleStateCopyKey, date?: string) {
  const entry = customerLifecycleCopy[locale].lifecycle[state];
  return { ...entry, body: entry.body.replace("{date}", date || (locale === "de" ? "zum angegebenen Zeitpunkt" : "the stated deadline")) };
}
