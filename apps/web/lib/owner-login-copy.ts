import type { PlatformLocale } from "./platform-config";

type OwnerLoginCopy = { eyebrow: string; title: string; email: string; password: string; continue: string };
export const ownerLoginCopy: Record<PlatformLocale, OwnerLoginCopy> = {
  en: { eyebrow: "Platform owner access", title: "Sign in to Finder.", email: "owner@company.com", password: "Password", continue: "Continue" },
  de: { eyebrow: "Plattform-Owner-Zugang", title: "Bei Finder anmelden.", email: "owner@unternehmen.de", password: "Passwort", continue: "Weiter" },
  fr: { eyebrow: "Accès propriétaire de la plateforme", title: "Connectez-vous à Finder.", email: "proprietaire@entreprise.fr", password: "Mot de passe", continue: "Continuer" },
  es: { eyebrow: "Acceso del propietario", title: "Inicie sesión en Finder.", email: "propietario@empresa.es", password: "Contraseña", continue: "Continuar" },
  it: { eyebrow: "Accesso proprietario piattaforma", title: "Accedi a Finder.", email: "proprietario@azienda.it", password: "Password", continue: "Continua" },
  sq: { eyebrow: "Aksesi i pronarit të platformës", title: "Hyni te Finder.", email: "pronar@kompania.al", password: "Fjalëkalimi", continue: "Vazhdo" },
};
