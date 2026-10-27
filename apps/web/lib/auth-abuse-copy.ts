import type { PlatformLocale } from "./platform-config";

type AuthAbuseCopy = {
  invalid: string;
  rateLimited: string;
  ownerConfiguration: string;
};

export const authAbuseCopy: Record<PlatformLocale, AuthAbuseCopy> = {
  en: {
    invalid: "The email or password is incorrect.",
    rateLimited: "Too many attempts. Please wait before trying again.",
    ownerConfiguration: "Owner access is not configured for production.",
  },
  de: {
    invalid: "E-Mail-Adresse oder Passwort ist falsch.",
    rateLimited: "Zu viele Versuche. Bitte warten Sie, bevor Sie es erneut versuchen.",
    ownerConfiguration: "Der Owner-Zugang ist für Production nicht konfiguriert.",
  },
  fr: {
    invalid: "L’adresse e-mail ou le mot de passe est incorrect.",
    rateLimited: "Trop de tentatives. Veuillez patienter avant de réessayer.",
    ownerConfiguration: "L’accès propriétaire n’est pas configuré pour la production.",
  },
  es: {
    invalid: "El correo electrónico o la contraseña son incorrectos.",
    rateLimited: "Demasiados intentos. Espere antes de volver a intentarlo.",
    ownerConfiguration: "El acceso del propietario no está configurado para producción.",
  },
  it: {
    invalid: "L’email o la password non sono corretti.",
    rateLimited: "Troppi tentativi. Attendi prima di riprovare.",
    ownerConfiguration: "L’accesso del proprietario non è configurato per la produzione.",
  },
  sq: {
    invalid: "Email-i ose fjalëkalimi nuk është i saktë.",
    rateLimited: "Ka shumë tentativa. Prisni pak përpara se të provoni përsëri.",
    ownerConfiguration: "Aksesi i pronarit nuk është konfiguruar për production.",
  },
};
