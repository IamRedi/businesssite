import type { SupportedLocale } from "./contracts";

type AboutInput = {
  name: string;
  description?: string;
  services: Array<{ title: string }>;
  locale: SupportedLocale;
  templateKey: string;
};

function listedServices(services: Array<{ title: string }>, locale: SupportedLocale) {
  const titles = services.map((service) => service.title.trim()).filter(Boolean).slice(0, 3);
  if (!titles.length) return "";
  if (titles.length === 1) return titles[0]!;
  const conjunction: Record<SupportedLocale, string> = {
    en: "and", de: "und", fr: "et", es: "y", it: "e", sq: "dhe",
  };
  return `${titles.slice(0, -1).join(", ")} ${conjunction[locale]} ${titles.at(-1)}`;
}

/**
 * Creates a safe, customer-facing about paragraph from verified profile data.
 * It deliberately adds no qualifications, guarantees, prices or unsupported claims.
 */
export function aboutTitleForBusiness(name: string, locale: SupportedLocale) {
  const prefix: Record<SupportedLocale, string> = {
    en: "About",
    de: "Über",
    fr: "À propos de",
    es: "Sobre",
    it: "Chi è",
    sq: "Rreth",
  };
  return `${prefix[locale]} ${name}`;
}

export function professionalServiceDescription(title: string, locale: SupportedLocale, position = 0) {
  const subject = title.trim() || {
    en: "This service", de: "Diese Leistung", fr: "Ce service", es: "Este servicio", it: "Questo servizio", sq: "Ky shërbim",
  }[locale];
  const copy: Record<SupportedLocale, readonly [string, string, string]> = {
    en: [
      `${subject} starts with a clear review of what is needed and how the service will be carried out.`,
      `${subject} is adapted to the specific situation, with the scope and next steps explained clearly.`,
      `${subject} includes clear coordination so the result and any useful follow-up are easy to understand.`,
    ],
    de: [
      `Bei „${subject}“ werden Bedarf, Ablauf und die nächsten Schritte von Anfang an klar abgestimmt.`,
      `„${subject}“ wird an die konkrete Situation angepasst und verständlich mit Ihnen geplant.`,
      `Für „${subject}“ sorgen klare Absprachen dafür, dass Ergebnis und weitere Schritte nachvollziehbar bleiben.`,
    ],
    fr: [
      `Pour « ${subject} », les besoins, le déroulement et les prochaines étapes sont clarifiés dès le départ.`,
      `« ${subject} » est adapté à la situation concrète, avec un périmètre expliqué de façon claire.`,
      `« ${subject} » comprend une coordination précise pour rendre le résultat et le suivi faciles à comprendre.`,
    ],
    es: [
      `En «${subject}» se aclaran desde el principio las necesidades, el proceso y los siguientes pasos.`,
      `«${subject}» se adapta a la situación concreta, con un alcance explicado de forma clara.`,
      `«${subject}» incluye una coordinación clara para entender fácilmente el resultado y el seguimiento.`,
    ],
    it: [
      `Per «${subject}» vengono chiariti fin dall'inizio esigenze, svolgimento e passaggi successivi.`,
      `«${subject}» viene adattato alla situazione concreta, con attività e tempi spiegati con chiarezza.`,
      `«${subject}» comprende un coordinamento chiaro per rendere comprensibili il risultato e gli eventuali passi successivi.`,
    ],
    sq: [
      `Për “${subject}” sqarohen që në fillim nevoja, mënyra e punës dhe hapat e ardhshëm.`,
      `“${subject}” përshtatet me situatën konkrete, me përmbajtjen dhe procesin të shpjeguar qartë.`,
      `“${subject}” përfshin koordinim të qartë, që rezultati dhe çdo hap pasues të kuptohen lehtë.`,
    ],
  };
  return copy[locale][Math.abs(position) % copy[locale].length];
}

function AlbanianSpecialistAbout(name: string, detail: string, templateKey: string) {
  const details = detail || "shërbime të përshtatura për nevojat e klientëve";
  const specific: Record<string, string> = {
    "gold-luxury": `${name} ofron një përvojë të përzgjedhur me vëmendje të veçantë ndaj cilësisë, detajeve dhe shërbimit personal. Shërbimet përfshijnë ${details}.`,
    "auto-repair": `${name} është një servis makinash i fokusuar te diagnostikimi i saktë, mirëmbajtja dhe riparimet e përditshme. Nga kontrolli fillestar te frenat dhe gomat, çdo automjet vlerësohet me kujdes dhe me shpjegim të qartë për punën e nevojshme.`,
    "car-dealership": `${name} ofron një përzgjedhje të kujdesshme automjetesh dhe informacion të qartë në çdo hap të procesit. Nga ${details}, fokusi është te një vendim i informuar dhe një dorëzim i organizuar.`,
    restaurant: `${name} sjell një përvojë mikpritëse rreth ushqimit të përgatitur me kujdes dhe shërbimit të vëmendshëm. Menuja dhe shërbimet përfshijnë ${details}.`,
    "fast-food": `${name} përgatit ushqim të freskët dhe praktik për ritmin e përditshëm. Përzgjedhja përfshin ${details}, me informacion të qartë për porosinë tuaj.`,
    barber: `${name} është një hapësirë e dedikuar për prerje flokësh dhe kujdes mashkullor të përshtatur. Shërbimet përfshijnë ${details}, me vëmendje te stili dhe detajet.`,
    "hair-salon": `${name} ofron kujdes profesional për flokët, nga konsultimi deri te rezultati i përfunduar. Shërbimet përfshijnë ${details}, të përshtatura me stilin dhe nevojat e çdo klienti.`,
    "beauty-studio": `${name} ofron kujdes estetik të menduar me vëmendje për detajet dhe rehatinë e klientit. Shërbimet kryesore përfshijnë ${details}.`,
    "nail-studio": `${name} është i fokusuar te kujdesi dhe dizajni i thonjve me vëmendje të veçantë ndaj detajeve. Shërbimet përfshijnë ${details}.`,
    "lashes-brows": `${name} ofron shërbime të specializuara për qerpikë dhe vetulla, të menduara për një rezultat të rregullt dhe natyral. Shërbimet përfshijnë ${details}.`,
    physiotherapy: `${name} ofron mbështetje profesionale për lëvizje më të lirë dhe rikuperim të kujdesshëm. Shërbimet përfshijnë ${details}.`,
    osteopathy: `${name} ofron një qasje të kujdesshme për lëvizjen, rehatinë dhe mirëqenien fizike. Shërbimet përfshijnë ${details}.`,
    massage: `${name} ofron masazh të përshtatur për relaksim, rikuperim dhe kujdes të përditshëm. Shërbimet përfshijnë ${details}.`,
    nutrition: `${name} ofron këshillim praktik për ushqyerje dhe rutina që përshtaten me nevojat personale. Shërbimet përfshijnë ${details}.`,
    wellness: `${name} krijon një hapësirë të qetë për mirëqenie, lëvizje të lehtë dhe kohë për veten. Shërbimet përfshijnë ${details}.`,
    "medical-practice": `${name} ofron konsultime mjekësore të organizuara me vëmendje ndaj informimit të qartë dhe nevojave individuale. Shërbimet përfshijnë ${details}.`,
    "dental-practice": `${name} ofron kujdes dentar të organizuar me konsultim të qartë dhe planifikim të kujdesshëm të trajtimit. Shërbimet përfshijnë ${details}.`,
    "home-care": `${name} ofron mbështetje të respektueshme në shtëpi, të përshtatur me rutinën dhe nevojat e përditshme të secilit person. Shërbimet përfshijnë ${details}.`,
    psychotherapy: `${name} ofron një hapësirë konfidenciale për biseda të kujdesshme dhe mbështetje të përshtatur me situatën individuale. Shërbimet përfshijnë ${details}.`,
    lawyer: `${name} ofron këshillim juridik të strukturuar dhe komunikim të qartë për çështje konkrete. Shërbimet përfshijnë ${details}.`,
    accountant: `${name} ofron mbështetje të organizuar për financa, tatime dhe vendime të qarta biznesi. Shërbimet përfshijnë ${details}.`,
    insurance: `${name} ndihmon klientët të kuptojnë dhe organizojnë mbulimin e sigurimit sipas nevojave të tyre. Shërbimet përfshijnë ${details}.`,
    architect: `${name} ofron planifikim arkitektonik të menduar nga ideja deri te koordinimi i projektit. Shërbimet përfshijnë ${details}.`,
    consultant: `${name} ofron këshillim të strukturuar për vendime, procese dhe objektiva të qarta biznesi. Shërbimet përfshijnë ${details}.`,
    consultation: `${name} ofron këshillim praktik dhe mbështetje të përshtatur për situata konkrete. Shërbimet përfshijnë ${details}.`,
    veterinary: `${name} ofron kujdes veterinar të vëmendshëm dhe udhëzim të qartë për shëndetin e kafshëve. Shërbimet përfshijnë ${details}.`,
    "pet-grooming": `${name} ofron kujdes të qetë dhe të kujdesshëm për higjienën dhe pamjen e kafshëve. Shërbimet përfshijnë ${details}.`,
    "dog-training": `${name} ndihmon qentë dhe pronarët të ndërtojnë rutina më të qarta përmes stërvitjes praktike. Shërbimet përfshijnë ${details}.`,
    "pet-wellness": `${name} ofron një hapësirë të qetë për mirëqenien dhe rehatinë e kafshëve. Shërbimet përfshijnë ${details}.`,
    "tree-service": `${name} ofron kujdes profesional për pemët dhe hapësirat e gjelbra. Nga ${details}, puna planifikohet sipas nevojave konkrete të ambientit.`,
    landscaping: `${name} krijon dhe mirëmban hapësira të jashtme të organizuara dhe funksionale. Shërbimet përfshijnë ${details}.`,
    "garden-maintenance": `${name} ofron kujdes të vazhdueshëm për kopshte dhe hapësira të gjelbra. Shërbimet përfshijnë ${details}.`,
    electrician: `${name} ofron punime elektrike dhe këshillim të qartë për banesa e biznese. Shërbimet përfshijnë ${details}.`,
    "plumbing-heating": `${name} ofron zgjidhje praktike për hidraulikë dhe ngrohje, nga kontrolli deri te mirëmbajtja. Shërbimet përfshijnë ${details}.`,
    "civil-engineering": `${name} ofron punime të strukturuara në infrastrukturë dhe ndërtim civil. Fushat kryesore përfshijnë ${details}.`,
    construction: `${name} ofron mbështetje të organizuar për projekte ndërtimi dhe rinovimi. Shërbimet përfshijnë ${details}.`,
    "house-construction": `${name} shoqëron projekte ndërtimi banesash me planifikim të qartë dhe koordinim të kujdesshëm. Shërbimet përfshijnë ${details}.`,
    "office-cleaning": `${name} ofron pastrim të organizuar për ambiente pune dhe hapësira profesionale. Shërbimet përfshijnë ${details}.`,
    "home-cleaning": `${name} ofron pastrim të kujdesshëm për shtëpi dhe hapësira të përditshme. Shërbimet përfshijnë ${details}.`,
    "window-cleaning": `${name} ofron pastrim të specializuar xhamash dhe mirëmbajtje të sipërfaqeve të jashtme. Shërbimet përfshijnë ${details}.`,
    courier: `${name} ofron dërgesa lokale të organizuara dhe komunikim të qartë për çdo porosi. Shërbimet përfshijnë ${details}.`,
    "local-delivery": `${name} ofron dërgesa të besueshme lokale për nevoja të përditshme dhe biznesi. Shërbimet përfshijnë ${details}.`,
    "facility-cleaning": `${name} ofron pastrim dhe mirëmbajtje të organizuar për ambiente profesionale. Shërbimet përfshijnë ${details}.`,
    locksmith: `${name} ofron ndihmë praktike për bravë, çelësa dhe pajisje dere me komunikim të qartë. Shërbimet përfshijnë ${details}.`,
    handyman: `${name} ndihmon me punë të përditshme për shtëpi dhe prona, të organizuara sipas nevojës. Shërbimet përfshijnë ${details}.`,
    moving: `${name} ofron mbështetje të organizuar për zhvendosje, nga planifikimi deri te transporti i sendeve. Shërbimet përfshijnë ${details}.`,
    irrigation: `${name} ofron planifikim dhe instalim praktik të ujitjes për hapësira të gjelbra. Shërbimet përfshijnë ${details}.`,
    "crane-service": `${name} ofron operacione ngritjeje të planifikuara me koordinim të kujdesshëm në kantier. Shërbimet përfshijnë ${details}.`,
    "fiber-network": `${name} ofron punime të organizuara për rrjete fibrash, nga planifikimi deri te kontrolli i lidhjes. Shërbimet përfshijnë ${details}.`,
    "glass-facade": `${name} ofron punime të sakta për xhama dhe fasada, nga vlerësimi deri te përfundimi. Shërbimet përfshijnë ${details}.`,
  };
  return specific[templateKey];
}

export function hasAlbanianSpecialistAbout(templateKey: string) {
  return Boolean(AlbanianSpecialistAbout("Business", "service", templateKey));
}

export function professionalAboutCopy({ name, description, services, locale, templateKey }: AboutInput) {
  const detail = listedServices(services, locale);
  if (locale === "sq") {
    const specialist = AlbanianSpecialistAbout(name, detail, templateKey);
    if (specialist && !description?.trim()) return specialist;
  }
  const facts = detail
    ? {
        en: `Its core services include ${detail}.`,
        de: `Zu den zentralen Leistungen gehören ${detail}.`,
        fr: `Ses services principaux comprennent ${detail}.`,
        es: `Sus servicios principales incluyen ${detail}.`,
        it: `I servizi principali includono ${detail}.`,
        sq: `Shërbimet kryesore përfshijnë ${detail}.`,
      }[locale]
    : "";
  const fallback: Record<SupportedLocale, string> = {
    en: `${name} is a local business focused on clear, dependable service and a straightforward customer experience.`,
    de: `${name} ist ein lokales Unternehmen mit klarem, zuverlässigem Service und einer unkomplizierten Kundenerfahrung.`,
    fr: `${name} est une entreprise locale qui privilégie un service fiable, clair et une expérience client simple.`,
    es: `${name} es un negocio local centrado en un servicio claro, fiable y una experiencia de cliente sencilla.`,
    it: `${name} è un’attività locale che punta su un servizio chiaro, affidabile e un’esperienza cliente semplice.`,
    sq: `${name} është një biznes lokal i përqendruar te shërbimi i qartë, i besueshëm dhe përvoja e thjeshtë e klientit.`,
  };
  const lead = description?.trim() || fallback[locale];
  return [lead, facts].filter(Boolean).join(" ");
}
