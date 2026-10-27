import { platformConfig } from "./platform-config";
import { customerLocaleTags } from "./locale-format";
import { resolveTransactionalEmailLocale, type TransactionalEmailLocale } from "./locale-model";

type Email = { to: string; subject: string; html: string; text: string };
export type EmailDelivery =
  | { status: "sent" }
  | { status: "provider_not_configured" }
  | { status: "provider_error" };

const en = {
  privacy: "Privacy notice", invitationSubject: (brand: string) => `Invitation to ${brand}`,
  invitation: (brand: string, role: string, expiry: string) => `You have been invited to the ${brand} owner workspace as ${role}. This one-time link expires ${expiry}. After choosing a password, multi-factor authentication is required.`,
  invitationAction: "Accept invitation", trialSubject: (business: string) => `Your ${business} website trial is ready`,
  trial: (expiry: string) => `Your editable website is ready. The private trial ends ${expiry}.`, trialAction: "Open your website editor",
  demoSubject: (business: string) => `Your private ${business} website demo is ready`, demo: (expiry: string) => `Your private website demo is ready to review and edit. The demo ends ${expiry}. The password setup link expires in one hour.`,
  previewAction: "Open private preview", passwordSetupAction: "Set your editor password",
  resetSubject: "Reset your website admin password", reset: "Use this one-time link to reset your password. It expires in one hour.", resetAction: "Reset password",
  appointmentSubject: (business: string) => `New appointment request for ${business}`, appointment: "A customer sent an appointment request. The business must confirm it personally.",
  appointmentName: "Customer", appointmentService: "Service", appointmentDate: "Preferred date", appointmentTime: "Preferred time", appointmentContact: "Contact",
} as const;
type EmailCopy = { [K in keyof typeof en]: typeof en[K] extends (...args: infer A) => string ? (...args: A) => string : string };
const de: EmailCopy = {
  privacy: "Datenschutzhinweise", invitationSubject: (brand) => `Einladung zu ${brand}`,
  invitation: (brand, role, expiry) => `Sie wurden als ${role} in den Owner-Bereich von ${brand} eingeladen. Der einmalige Link läuft ${expiry} ab. Nach der Passwortwahl ist Mehrfaktor-Authentifizierung erforderlich.`,
  invitationAction: "Einladung annehmen", trialSubject: (business) => `Ihre Test-Website für ${business} ist bereit`,
  trial: (expiry) => `Ihre bearbeitbare Website ist bereit. Die private Testphase endet ${expiry}.`, trialAction: "Website-Editor öffnen",
  demoSubject: (business) => `Ihre private Website-Demo für ${business} ist bereit`, demo: (expiry) => `Ihre private Website-Demo kann geprüft und bearbeitet werden. Die Demo endet ${expiry}. Der Link zur Passwortvergabe läuft nach einer Stunde ab.`,
  previewAction: "Private Vorschau öffnen", passwordSetupAction: "Editor-Passwort festlegen",
  resetSubject: "Passwort für die Website-Verwaltung zurücksetzen", reset: "Verwenden Sie diesen einmaligen Link, um Ihr Passwort zurückzusetzen. Er läuft nach einer Stunde ab.", resetAction: "Passwort zurücksetzen",
  appointmentSubject: (business) => `Neue Terminanfrage für ${business}`, appointment: "Ein Kunde hat eine Terminanfrage gesendet. Der Betrieb muss sie persönlich bestätigen.",
  appointmentName: "Kunde", appointmentService: "Leistung", appointmentDate: "Gewünschtes Datum", appointmentTime: "Gewünschte Uhrzeit", appointmentContact: "Kontakt",
};
export const transactionalEmailCopy = { en, de } satisfies Record<TransactionalEmailLocale, EmailCopy>;

function emailConfiguration() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export async function sendTransactionalEmail(email: Email): Promise<EmailDelivery> {
  const configuration = emailConfiguration();
  if (!configuration) return { status: "provider_not_configured" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${configuration.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: configuration.from, ...email }),
    });
    return response.ok ? { status: "sent" } : { status: "provider_error" };
  } catch {
    return { status: "provider_error" };
  }
}

function origin() { return process.env.PUBLIC_APP_URL?.trim() || "http://localhost:3000"; }
export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
const safeSubjectValue = (value: string) => value.replace(/[\r\n]+/g, " ").trim().slice(0, 160);
const date = (locale: TransactionalEmailLocale, value: string) => new Intl.DateTimeFormat(customerLocaleTags[locale], { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
const privacyUrl = (locale: TransactionalEmailLocale) => `${origin()}/legal/privacy?lang=${locale}`;
const paragraphHtml = (value: string) => `<p>${escapeEmailHtml(value)}</p>`;
const linkHtml = (url: string, label: string) => `<p><a href="${escapeEmailHtml(url)}">${escapeEmailHtml(label)}</a></p>`;

export async function sendOwnerTeamInvitation(input: { to: string; token: string; role: string; expiresAt: string; brandName?: string; locale?: unknown }) {
  const locale = resolveTransactionalEmailLocale(input.locale); const copy = transactionalEmailCopy[locale];
  const brandName = safeSubjectValue(input.brandName || platformConfig.brand.name);
  const invitationUrl = `${origin()}/owner/invitation#token=${encodeURIComponent(input.token)}`;
  const body = copy.invitation(brandName, input.role, date(locale, input.expiresAt));
  return sendTransactionalEmail({ to: input.to, subject: copy.invitationSubject(brandName), html: paragraphHtml(body) + linkHtml(invitationUrl, copy.invitationAction) + linkHtml(privacyUrl(locale), copy.privacy), text: `${body}\n\n${copy.invitationAction}: ${invitationUrl}\n${copy.privacy}: ${privacyUrl(locale)}` });
}

export async function sendTrialWelcome(input: { to: string; businessName: string; slug: string; expiresAt: string; locale: unknown }) {
  const locale = resolveTransactionalEmailLocale(input.locale); const copy = transactionalEmailCopy[locale];
  const business = safeSubjectValue(input.businessName); const editorUrl = `${origin()}/site-admin/${encodeURIComponent(input.slug)}`;
  const body = copy.trial(date(locale, input.expiresAt));
  return sendTransactionalEmail({ to: input.to, subject: copy.trialSubject(business), html: paragraphHtml(body) + linkHtml(editorUrl, copy.trialAction) + linkHtml(privacyUrl(locale), copy.privacy), text: `${body}\n\n${copy.trialAction}: ${editorUrl}\n${copy.privacy}: ${privacyUrl(locale)}` });
}

export async function sendOwnerDemoInvitation(input: { to: string; businessName: string; previewUrl: string; passwordSetupToken: string; expiresAt: string; locale: unknown }) {
  const locale = resolveTransactionalEmailLocale(input.locale); const copy = transactionalEmailCopy[locale];
  const business = safeSubjectValue(input.businessName); const passwordSetupUrl = `${origin()}/site-admin/reset-password?token=${encodeURIComponent(input.passwordSetupToken)}`;
  const body = copy.demo(date(locale, input.expiresAt));
  return sendTransactionalEmail({ to: input.to, subject: copy.demoSubject(business), html: paragraphHtml(body) + linkHtml(input.previewUrl, copy.previewAction) + linkHtml(passwordSetupUrl, copy.passwordSetupAction) + linkHtml(privacyUrl(locale), copy.privacy), text: `${body}\n\n${copy.previewAction}: ${input.previewUrl}\n${copy.passwordSetupAction}: ${passwordSetupUrl}\n${copy.privacy}: ${privacyUrl(locale)}` });
}

export async function sendPasswordReset(input: { to: string; token: string; locale: unknown }) {
  const locale = resolveTransactionalEmailLocale(input.locale); const copy = transactionalEmailCopy[locale];
  const url = `${origin()}/site-admin/reset-password?token=${encodeURIComponent(input.token)}`;
  return sendTransactionalEmail({ to: input.to, subject: copy.resetSubject, html: paragraphHtml(copy.reset) + linkHtml(url, copy.resetAction) + linkHtml(privacyUrl(locale), copy.privacy), text: `${copy.reset}\n\n${copy.resetAction}: ${url}\n${copy.privacy}: ${privacyUrl(locale)}` });
}

export async function sendAppointmentRequestNotification(input: { to: string; businessName: string; customerName: string; phone: string; email?: string; serviceTitle?: string; preferredDate?: string; preferredTime?: string; locale: unknown }) {
  const locale = resolveTransactionalEmailLocale(input.locale); const copy = transactionalEmailCopy[locale];
  const business = safeSubjectValue(input.businessName);
  const details = [
    `${copy.appointmentName}: ${input.customerName}`, `${copy.appointmentContact}: ${[input.phone, input.email].filter(Boolean).join(" · ")}`,
    input.serviceTitle ? `${copy.appointmentService}: ${input.serviceTitle}` : "", input.preferredDate ? `${copy.appointmentDate}: ${input.preferredDate}` : "",
    input.preferredTime ? `${copy.appointmentTime}: ${input.preferredTime}` : "",
  ].filter(Boolean);
  return sendTransactionalEmail({ to: input.to, subject: copy.appointmentSubject(business), html: paragraphHtml(copy.appointment) + details.map(paragraphHtml).join("") + linkHtml(privacyUrl(locale), copy.privacy), text: `${copy.appointment}\n\n${details.join("\n")}\n\n${copy.privacy}: ${privacyUrl(locale)}` });
}
