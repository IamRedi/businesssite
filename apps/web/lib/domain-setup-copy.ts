import type { SupportedLocale } from "@platform/website-engine";

type DomainSetupCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  existingTitle: string;
  existingIntro: string;
  domainLabel: string;
  save: string;
  status: string;
  states: Record<"not_requested" | "pending_dns" | "verified" | "failed", string>;
  ownership: string;
  routing: string;
  complete: string;
  pending: string;
  recordsTitle: string;
  recordsIntro: string;
  type: string;
  name: string;
  value: string;
  purpose: string;
  purposes: Record<"ownership" | "routing", string>;
  copy: string;
  copied: string;
  verify: string;
  checked: string;
  buyTitle: string;
  buyIntro: string;
  buyExternal: (provider: string) => string;
  directPurchase: string;
  comingSoon: string;
  messages: Record<"invalid" | "requested" | "pending" | "verified" | "provider_error", string>;
};

const en: DomainSetupCopy = {
  eyebrow: "Custom domain",
  title: "Connect your business domain",
  intro: "Use a domain you already own now. We verify ownership, DNS routing and hosting before it can serve your public website.",
  existingTitle: "I already own a domain",
  existingIntro: "Enter only the domain name. Never enter your registrar password here.",
  domainLabel: "Your domain",
  save: "Start secure connection",
  status: "Connection status",
  states: { not_requested: "Not started", pending_dns: "Waiting for DNS", verified: "Live and secure", failed: "Needs attention" },
  ownership: "Ownership",
  routing: "Website routing",
  complete: "Complete",
  pending: "Pending",
  recordsTitle: "DNS records to add",
  recordsIntro: "Open your domain provider's DNS settings and add these exact records. Existing email records such as MX must remain unchanged.",
  type: "Type",
  name: "Name / host",
  value: "Value / target",
  purpose: "Purpose",
  purposes: { ownership: "Ownership verification", routing: "Website connection" },
  copy: "Copy",
  copied: "Copied",
  verify: "Check DNS now",
  checked: "Last checked",
  buyTitle: "I need a new domain",
  buyIntro: "For now, purchase the domain in your own name at the configured registrar, then return here and connect it above.",
  buyExternal: (provider) => `Find a domain at ${provider}`,
  directPurchase: "Buy directly in BusinessSite",
  comingSoon: "Coming soon",
  messages: { invalid: "Enter a valid public domain.", requested: "Domain saved. Add the displayed DNS records.", pending: "DNS has not fully propagated yet. Try again shortly.", verified: "Domain verified and correctly routed. Your website is live.", provider_error: "The hosting provider could not complete the check. No domain was activated." },
};

export const domainSetupCopy: Record<SupportedLocale, DomainSetupCopy> = {
  en,
  de: {
    ...en,
    eyebrow: "Eigene Domain",
    title: "Unternehmensdomain verbinden",
    intro: "Nutzen Sie jetzt eine Domain, die Ihnen bereits gehört. Eigentum, DNS-Verbindung und Hosting werden vor der Veröffentlichung geprüft.",
    existingTitle: "Ich besitze bereits eine Domain",
    existingIntro: "Geben Sie nur den Domainnamen ein. Tragen Sie hier niemals Ihr Registrar-Passwort ein.",
    domainLabel: "Ihre Domain",
    save: "Sichere Verbindung starten",
    status: "Verbindungsstatus",
    states: { not_requested: "Nicht begonnen", pending_dns: "Wartet auf DNS", verified: "Live und sicher", failed: "Prüfung erforderlich" },
    ownership: "Eigentumsnachweis",
    routing: "Website-Verbindung",
    complete: "Erledigt",
    pending: "Ausstehend",
    recordsTitle: "Einzutragende DNS-Einträge",
    recordsIntro: "Öffnen Sie die DNS-Einstellungen Ihres Domainanbieters und tragen Sie diese Werte exakt ein. Vorhandene E-Mail-Einträge wie MX bleiben unverändert.",
    type: "Typ",
    name: "Name / Host",
    value: "Wert / Ziel",
    purpose: "Zweck",
    purposes: { ownership: "Eigentum bestätigen", routing: "Website verbinden" },
    copy: "Kopieren",
    copied: "Kopiert",
    verify: "DNS jetzt prüfen",
    checked: "Zuletzt geprüft",
    buyTitle: "Ich benötige eine neue Domain",
    buyIntro: "Kaufen Sie die Domain vorerst beim angegebenen Registrar auf Ihren eigenen Namen. Kehren Sie danach hierher zurück und verbinden Sie sie oben.",
    buyExternal: (provider) => `Domain bei ${provider} suchen`,
    directPurchase: "Direkt in BusinessSite kaufen",
    messages: { invalid: "Geben Sie eine gültige öffentliche Domain ein.", requested: "Domain gespeichert. Tragen Sie jetzt die angezeigten DNS-Einträge ein.", pending: "DNS ist noch nicht vollständig aktiv. Versuchen Sie es in Kürze erneut.", verified: "Domain wurde bestätigt und korrekt verbunden. Ihre Website ist live.", provider_error: "Der Hostinganbieter konnte die Prüfung nicht abschließen. Es wurde keine Domain aktiviert." },
  },
  fr: {
    ...en,
    eyebrow: "Domaine personnalisé",
    title: "Connecter le domaine de votre entreprise",
    intro: "Utilisez un domaine que vous possédez déjà. La propriété, le routage DNS et l’hébergement sont vérifiés avant la mise en ligne.",
    existingTitle: "Je possède déjà un domaine",
    existingIntro: "Saisissez uniquement le nom de domaine. Ne saisissez jamais le mot de passe de votre registrar ici.",
    domainLabel: "Votre domaine",
    save: "Démarrer la connexion sécurisée",
    status: "État de la connexion",
    states: { not_requested: "Non commencé", pending_dns: "En attente du DNS", verified: "En ligne et sécurisé", failed: "Vérification requise" },
    ownership: "Propriété",
    routing: "Routage du site",
    complete: "Terminé",
    pending: "En attente",
    recordsTitle: "Enregistrements DNS à ajouter",
    recordsIntro: "Ajoutez exactement ces valeurs dans les réglages DNS de votre fournisseur. Conservez les enregistrements e-mail existants, notamment MX.",
    type: "Type",
    name: "Nom / hôte",
    value: "Valeur / cible",
    purpose: "Fonction",
    purposes: { ownership: "Vérification de propriété", routing: "Connexion du site" },
    copy: "Copier",
    copied: "Copié",
    verify: "Vérifier le DNS",
    checked: "Dernière vérification",
    buyTitle: "J’ai besoin d’un nouveau domaine",
    buyIntro: "Achetez pour l’instant le domaine à votre nom chez le registrar configuré, puis revenez ici pour le connecter.",
    buyExternal: (provider) => `Rechercher chez ${provider}`,
    directPurchase: "Acheter directement dans BusinessSite",
    messages: { invalid: "Saisissez un domaine public valide.", requested: "Domaine enregistré. Ajoutez maintenant les enregistrements DNS affichés.", pending: "Le DNS n’est pas encore entièrement propagé. Réessayez bientôt.", verified: "Le domaine est vérifié et correctement routé. Votre site est en ligne.", provider_error: "Le fournisseur d’hébergement n’a pas pu terminer la vérification. Aucun domaine n’a été activé." },
  },
  es: {
    ...en,
    eyebrow: "Dominio personalizado",
    title: "Conecte el dominio de su negocio",
    intro: "Use un dominio que ya posee. Verificamos propiedad, DNS y alojamiento antes de publicar el sitio.",
    existingTitle: "Ya tengo un dominio",
    existingIntro: "Introduzca únicamente el dominio. Nunca escriba aquí la contraseña del registrador.",
    domainLabel: "Su dominio",
    save: "Iniciar conexión segura",
    status: "Estado de conexión",
    states: { not_requested: "No iniciado", pending_dns: "Esperando DNS", verified: "Activo y seguro", failed: "Requiere atención" },
    ownership: "Propiedad",
    routing: "Conexión del sitio",
    complete: "Completo",
    pending: "Pendiente",
    recordsTitle: "Registros DNS que debe añadir",
    recordsIntro: "Añada exactamente estos registros en el proveedor del dominio. Mantenga sin cambios los registros de correo existentes, como MX.",
    type: "Tipo",
    name: "Nombre / host",
    value: "Valor / destino",
    purpose: "Finalidad",
    purposes: { ownership: "Verificación de propiedad", routing: "Conexión del sitio" },
    copy: "Copiar",
    copied: "Copiado",
    verify: "Comprobar DNS",
    checked: "Última comprobación",
    buyTitle: "Necesito un dominio nuevo",
    buyIntro: "Por ahora, compre el dominio a su nombre en el registrador configurado y vuelva aquí para conectarlo.",
    buyExternal: (provider) => `Buscar dominio en ${provider}`,
    directPurchase: "Comprar directamente en BusinessSite",
    messages: { invalid: "Introduzca un dominio público válido.", requested: "Dominio guardado. Añada los registros DNS mostrados.", pending: "El DNS aún no se ha propagado por completo. Inténtelo de nuevo en breve.", verified: "El dominio está verificado y correctamente conectado. Su sitio está activo.", provider_error: "El proveedor de alojamiento no pudo completar la comprobación. No se activó ningún dominio." },
  },
  it: {
    ...en,
    eyebrow: "Dominio personalizzato",
    title: "Collega il dominio della tua attività",
    intro: "Usa un dominio che possiedi già. Proprietà, DNS e hosting vengono verificati prima della pubblicazione.",
    existingTitle: "Possiedo già un dominio",
    existingIntro: "Inserisci solo il nome del dominio. Non inserire mai qui la password del registrar.",
    domainLabel: "Il tuo dominio",
    save: "Avvia connessione sicura",
    status: "Stato connessione",
    states: { not_requested: "Non iniziata", pending_dns: "In attesa del DNS", verified: "Online e sicuro", failed: "Richiede attenzione" },
    ownership: "Proprietà",
    routing: "Collegamento sito",
    complete: "Completato",
    pending: "In attesa",
    recordsTitle: "Record DNS da aggiungere",
    recordsIntro: "Aggiungi questi record esatti nelle impostazioni DNS del provider. Non modificare i record email esistenti, come MX.",
    type: "Tipo",
    name: "Nome / host",
    value: "Valore / destinazione",
    purpose: "Scopo",
    purposes: { ownership: "Verifica proprietà", routing: "Collegamento sito" },
    copy: "Copia",
    copied: "Copiato",
    verify: "Controlla DNS",
    checked: "Ultimo controllo",
    buyTitle: "Mi serve un nuovo dominio",
    buyIntro: "Per ora acquista il dominio a tuo nome presso il registrar configurato, poi torna qui e collegalo.",
    buyExternal: (provider) => `Cerca dominio su ${provider}`,
    directPurchase: "Acquista direttamente in BusinessSite",
    messages: { invalid: "Inserisci un dominio pubblico valido.", requested: "Dominio salvato. Aggiungi i record DNS mostrati.", pending: "Il DNS non è ancora completamente propagato. Riprova tra poco.", verified: "Il dominio è verificato e collegato correttamente. Il sito è online.", provider_error: "Il provider di hosting non ha completato il controllo. Nessun dominio è stato attivato." },
  },
  sq: {
    ...en,
    eyebrow: "Domain personal",
    title: "Lidhni domain-in e biznesit",
    intro: "Përdorni një domain që e zotëroni. Pronësia, lidhja DNS dhe hosting-u verifikohen para se website-i të bëhet publik në të.",
    existingTitle: "Kam një domain ekzistues",
    existingIntro: "Vendosni vetëm emrin e domain-it. Mos vendosni kurrë këtu fjalëkalimin e registrar-it.",
    domainLabel: "Domain-i juaj",
    save: "Fillo lidhjen e sigurt",
    status: "Gjendja e lidhjes",
    states: { not_requested: "Nuk ka filluar", pending_dns: "Në pritje të DNS-së", verified: "Aktiv dhe i sigurt", failed: "Kërkon kontroll" },
    ownership: "Pronësia",
    routing: "Lidhja e website-it",
    complete: "Përfunduar",
    pending: "Në pritje",
    recordsTitle: "Rekordet DNS që duhen shtuar",
    recordsIntro: "Hapni konfigurimin DNS te ofruesi i domain-it dhe shtoni saktësisht këto rekorde. Mos ndryshoni rekordet ekzistuese të email-it, si MX.",
    type: "Lloji",
    name: "Emri / host-i",
    value: "Vlera / destinacioni",
    purpose: "Qëllimi",
    purposes: { ownership: "Verifikimi i pronësisë", routing: "Lidhja e website-it" },
    copy: "Kopjo",
    copied: "U kopjua",
    verify: "Kontrollo DNS-në",
    checked: "Kontrolli i fundit",
    buyTitle: "Më duhet një domain i ri",
    buyIntro: "Për momentin blijeni domain-in në emrin tuaj te registrar-i i konfiguruar, pastaj kthehuni këtu dhe lidheni më sipër.",
    buyExternal: (provider) => `Kërko domain te ${provider}`,
    directPurchase: "Blej direkt në BusinessSite",
    comingSoon: "Së shpejti",
    messages: { invalid: "Vendosni një domain publik të vlefshëm.", requested: "Domain-i u ruajt. Tani shtoni rekordet DNS të shfaqura.", pending: "DNS-ja nuk është përhapur ende plotësisht. Provojeni përsëri pas pak.", verified: "Domain-i u verifikua dhe u lidh saktë. Website-i është aktiv.", provider_error: "Ofruesi i hosting-ut nuk e përfundoi kontrollin. Asnjë domain nuk u aktivizua." },
  },
};

export function configuredDomainSetupCopy(locale: SupportedLocale, platformName: string): DomainSetupCopy {
  const copy = domainSetupCopy[locale];
  return { ...copy, directPurchase: copy.directPurchase.replace("BusinessSite", platformName.trim() || "Platform") };
}
