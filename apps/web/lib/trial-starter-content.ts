import type { SupportedLocale } from "@platform/website-engine";
import { businessCategorySubcategory, resolveLegacyBusinessCategory } from "@platform/website-engine";
import {
  genericServiceDescriptions,
  trialServiceDescriptions,
  type TrialCategory,
} from "./trial-service-descriptions";

export type StarterService = { title: string; description: string };
export type StarterContent = { description: string; services: StarterService[] };
type RawStarterContent = { description: string; services: string[] };

const generic: Record<SupportedLocale, RawStarterContent> = {
  en: { description: "A dependable local business focused on thoughtful service, clear communication and a confident customer experience.", services: ["Personal consultation", "Tailored service", "Reliable follow-up"] },
  de: { description: "Ein zuverlässiges lokales Unternehmen mit persönlichem Service, klarer Kommunikation und einem überzeugenden Kundenerlebnis.", services: ["Persönliche Beratung", "Passende Leistung", "Zuverlässige Betreuung"] },
  fr: { description: "Une entreprise locale fiable, attentive au service, à une communication claire et à une expérience client rassurante.", services: ["Conseil personnalisé", "Service adapté", "Suivi fiable"] },
  es: { description: "Un negocio local fiable, centrado en un servicio atento, una comunicación clara y una experiencia de cliente segura.", services: ["Asesoramiento personal", "Servicio a medida", "Seguimiento fiable"] },
  it: { description: "Un’attività locale affidabile, attenta al servizio, alla comunicazione chiara e a un’esperienza cliente sicura.", services: ["Consulenza personale", "Servizio su misura", "Assistenza affidabile"] },
  sq: { description: "Një biznes lokal i besueshëm, i përqendruar te shërbimi i kujdesshëm, komunikimi i qartë dhe përvoja e mirë e klientit.", services: ["Këshillim personal", "Shërbim i përshtatur", "Mbështetje e besueshme"] },
};

const templateFamilies: Partial<Record<string, TrialCategory>> = {
  barber: "barber", "hair-salon": "hair-salon", "nail-studio": "beauty", "lashes-brows": "beauty", "beauty-studio": "beauty",
  restaurant: "restaurant", "fast-food": "fast-food", "auto-repair": "auto-repair", "car-dealership": "car-dealership",
  physiotherapy: "physiotherapy", osteopathy: "physiotherapy", massage: "physiotherapy", nutrition: "physiotherapy", wellness: "physiotherapy",
  "medical-practice": "medical-practice", "dental-practice": "dental-practice", "home-care": "home-care", psychotherapy: "psychotherapy",
  lawyer: "professional", accountant: "professional", insurance: "professional", architect: "professional", consultant: "professional", consultation: "professional",
  veterinary: "pet", "pet-grooming": "pet", "dog-training": "pet", "pet-wellness": "pet",
  "window-cleaning": "cleaning", "office-cleaning": "cleaning", "facility-cleaning": "cleaning", "home-cleaning": "cleaning",
  electrician: "electrician", "plumbing-heating": "plumbing",
  courier: "delivery", moving: "delivery", "local-delivery": "delivery",
  "tree-service": "garden", landscaping: "garden", "garden-maintenance": "garden", irrigation: "garden",
  "house-construction": "construction", construction: "construction", "civil-engineering": "construction", "glass-facade": "construction",
};

function categoryKind(category: string, templateKey?: string): TrialCategory | undefined {
  if (templateKey && templateFamilies[templateKey]) return templateFamilies[templateKey];
  // Canonical registry first (BSRC-DESIGN-P4-001): the legacy free-text
  // string resolves to a subcategory and its canonical template key; the
  // keyword list below remains the compatibility fallback.
  const legacy = resolveLegacyBusinessCategory(category);
  const legacyTemplateKey = legacy.subcategoryKey
    ? businessCategorySubcategory(legacy.subcategoryKey)?.defaultTemplateKey
    : undefined;
  if (legacyTemplateKey && templateFamilies[legacyTemplateKey]) return templateFamilies[legacyTemplateKey];
  const value = category.toLowerCase();
  if (value.includes("car repair")) return "auto-repair";
  if (value.includes("car dealership")) return "car-dealership";
  if (value.includes("fast food")) return "fast-food";
  if (value.includes("restaurant")) return "restaurant";
  if (value.includes("barber")) return "barber";
  if (value.includes("hair")) return "hair-salon";
  if (value.includes("beauty")) return "beauty";
  if (value.includes("dent") || value.includes("zahnarzt") || value.includes("stomatolog")) return "dental-practice";
  if (value.includes("altenpflege") || value.includes("pflege") || value.includes("home care") || value.includes("elderly care") || value.includes("nursing")) return "home-care";
  if (value.includes("psych") || value.includes("counselling")) return "psychotherapy";
  if (value.includes("doctor") || value.includes("arzt") || value.includes("medical practice") || value.includes("physician")) return "medical-practice";
  if (value.includes("physio")) return "physiotherapy";
  if (value.includes("professional")) return "professional";
  if (value.includes("pet")) return "pet";
  if (value.includes("clean")) return "cleaning";
  if (value.includes("electric")) return "electrician";
  if (value.includes("plumb")) return "plumbing";
  if (value.includes("construction")) return "construction";
  if (value.includes("garden") || value.includes("tree")) return "garden";
  if (value.includes("delivery") || value.includes("transport")) return "delivery";
}

const labels: Record<Exclude<SupportedLocale, "sq">, Record<TrialCategory, string>> = {
  en: { "auto-repair": "auto repair workshop", "car-dealership": "car dealership", restaurant: "restaurant", "fast-food": "fast-food restaurant", barber: "barbershop", "hair-salon": "hair salon", beauty: "beauty studio", "medical-practice": "medical practice", "dental-practice": "dental practice", "home-care": "home-care service", psychotherapy: "psychotherapy practice", physiotherapy: "physiotherapy practice", professional: "professional-services firm", pet: "pet-care business", cleaning: "cleaning service", electrician: "electrical service", plumbing: "plumbing and heating service", construction: "construction business", garden: "garden and tree-care service", delivery: "local delivery service" },
  de: { "auto-repair": "Kfz-Werkstatt", "car-dealership": "Autohaus", restaurant: "Restaurant", "fast-food": "Schnellrestaurant", barber: "Barbershop", "hair-salon": "Friseursalon", beauty: "Kosmetikstudio", "medical-practice": "Arztpraxis", "dental-practice": "Zahnarztpraxis", "home-care": "ambulanter Pflegedienst", psychotherapy: "Psychotherapiepraxis", physiotherapy: "Physiotherapiepraxis", professional: "Beratungsunternehmen", pet: "Tierpflegebetrieb", cleaning: "Reinigungsservice", electrician: "Elektrofachbetrieb", plumbing: "Sanitär- und Heizungsbetrieb", construction: "Bauunternehmen", garden: "Garten- und Baumpflegebetrieb", delivery: "lokaler Lieferservice" },
  fr: { "auto-repair": "atelier automobile", "car-dealership": "concession automobile", restaurant: "restaurant", "fast-food": "restauration rapide", barber: "barbershop", "hair-salon": "salon de coiffure", beauty: "institut de beauté", "medical-practice": "cabinet médical", "dental-practice": "cabinet dentaire", "home-care": "service d’aide à domicile", psychotherapy: "cabinet de psychothérapie", physiotherapy: "cabinet de kinésithérapie", professional: "cabinet de conseil", pet: "service de soins pour animaux", cleaning: "service de nettoyage", electrician: "entreprise d’électricité", plumbing: "service de plomberie et chauffage", construction: "entreprise de construction", garden: "service de jardinage et d’élagage", delivery: "service de livraison locale" },
  es: { "auto-repair": "taller de automóviles", "car-dealership": "concesionario", restaurant: "restaurante", "fast-food": "restaurante de comida rápida", barber: "barbería", "hair-salon": "salón de peluquería", beauty: "centro de belleza", "medical-practice": "consulta médica", "dental-practice": "clínica dental", "home-care": "servicio de atención domiciliaria", psychotherapy: "consulta de psicoterapia", physiotherapy: "clínica de fisioterapia", professional: "empresa de servicios profesionales", pet: "servicio para mascotas", cleaning: "servicio de limpieza", electrician: "empresa de electricidad", plumbing: "servicio de fontanería y calefacción", construction: "empresa de construcción", garden: "servicio de jardinería y arbolado", delivery: "servicio de reparto local" },
  it: { "auto-repair": "officina automobilistica", "car-dealership": "concessionaria auto", restaurant: "ristorante", "fast-food": "ristorante fast food", barber: "barberia", "hair-salon": "salone di parrucchiere", beauty: "centro estetico", "medical-practice": "studio medico", "dental-practice": "studio dentistico", "home-care": "servizio di assistenza domiciliare", psychotherapy: "studio di psicoterapia", physiotherapy: "studio di fisioterapia", professional: "società di servizi professionali", pet: "servizio per animali", cleaning: "servizio di pulizia", electrician: "impresa elettrica", plumbing: "servizio idraulico e di riscaldamento", construction: "impresa edile", garden: "servizio di giardinaggio e cura degli alberi", delivery: "servizio di consegna locale" },
};

const healthDescriptions: Partial<Record<TrialCategory, Record<Exclude<SupportedLocale, "sq">, string>>> = {
  "medical-practice": {
    en: "A professional medical practice for attentive consultations, clear information and respectful support with everyday health matters.",
    de: "Eine professionelle Arztpraxis für aufmerksame Gespräche, verständliche Informationen und respektvolle Begleitung bei gesundheitlichen Anliegen.",
    fr: "Un cabinet médical professionnel pour des consultations attentives, une information claire et un accompagnement respectueux au quotidien.",
    es: "Una consulta médica profesional para conversaciones atentas, información clara y una atención respetuosa en cuestiones de salud cotidianas.",
    it: "Uno studio medico professionale per consulti attenti, informazioni chiare e un supporto rispettoso nelle esigenze di salute quotidiane.",
  },
  "dental-practice": {
    en: "A modern dental practice for calm consultations, careful planning and clear information before every treatment decision.",
    de: "Eine moderne Zahnarztpraxis für ruhige Beratung, sorgfältige Planung und verständliche Informationen vor jeder Behandlungsentscheidung.",
    fr: "Un cabinet dentaire moderne pour des consultations sereines, une planification attentive et une information claire avant chaque décision.",
    es: "Una clínica dental moderna para consultas tranquilas, una planificación cuidadosa e información clara antes de cada decisión.",
    it: "Uno studio dentistico moderno per consulenze serene, pianificazione accurata e informazioni chiare prima di ogni decisione.",
  },
  "home-care": {
    en: "Respectful support at home, planned around familiar routines, clear coordination and the individual needs of each person.",
    de: "Respektvolle Unterstützung zu Hause, abgestimmt auf vertraute Abläufe, klare Koordination und die individuellen Bedürfnisse jedes Menschen.",
    fr: "Un accompagnement respectueux à domicile, organisé autour des habitudes, d’une coordination claire et des besoins de chaque personne.",
    es: "Apoyo respetuoso en el hogar, organizado según las rutinas, una coordinación clara y las necesidades de cada persona.",
    it: "Un supporto rispettoso a domicilio, organizzato attorno alle abitudini, a un coordinamento chiaro e alle esigenze di ogni persona.",
  },
  psychotherapy: {
    en: "A confidential practice for thoughtful conversations, clear orientation and support shaped around each individual situation.",
    de: "Eine vertrauliche Praxis für achtsame Gespräche, klare Orientierung und Unterstützung, die sich an der individuellen Situation ausrichtet.",
    fr: "Un cabinet confidentiel pour des échanges attentifs, une orientation claire et un accompagnement adapté à chaque situation.",
    es: "Una consulta confidencial para conversaciones reflexivas, orientación clara y apoyo adaptado a cada situación individual.",
    it: "Uno studio riservato per colloqui attenti, orientamento chiaro e supporto adatto alla situazione di ogni persona.",
  },
};

function localizedCategoryStarter(category: string, locale: Exclude<SupportedLocale, "sq">, templateKey?: string): RawStarterContent {
  const kind = categoryKind(category, templateKey);
  if (!kind) return generic[locale];
  const label = labels[locale][kind];
  const description: Record<Exclude<SupportedLocale, "sq">, string> = {
    en: `A local ${label} focused on thoughtful service, clear communication and a confident customer experience.`,
    de: `Eine lokale ${label} mit persönlichem Service, klarer Kommunikation und einem überzeugenden Kundenerlebnis.`,
    fr: `Un ${label} local attentif au service, à une communication claire et à une expérience client rassurante.`,
    es: `Un ${label} local centrado en un servicio atento, una comunicación clara y una experiencia de cliente segura.`,
    it: `Un’${label} locale attenta al servizio, alla comunicazione chiara e a un’esperienza cliente sicura.`,
  };
  const services: Partial<Record<TrialCategory, Record<Exclude<SupportedLocale, "sq">, string[]>>> = {
    "auto-repair": {
      en: ["Vehicle diagnostics", "Maintenance and repairs", "Brakes and tyres"],
      de: ["Fahrzeugdiagnose", "Wartung und Reparatur", "Bremsen und Reifen"],
      fr: ["Diagnostic automobile", "Entretien et réparations", "Freins et pneus"],
      es: ["Diagnóstico del vehículo", "Mantenimiento y reparaciones", "Frenos y neumáticos"],
      it: ["Diagnostica del veicolo", "Manutenzione e riparazioni", "Freni e pneumatici"],
    },
    "car-dealership": {
      en: ["Vehicle selection", "Test drive", "Purchase and handover"],
      de: ["Fahrzeugauswahl", "Probefahrt", "Kauf und Übergabe"],
      fr: ["Sélection de véhicules", "Essai routier", "Achat et livraison"],
      es: ["Selección de vehículos", "Prueba de conducción", "Compra y entrega"],
      it: ["Selezione veicoli", "Test drive", "Acquisto e consegna"],
    },
    restaurant: {
      en: ["Seasonal menu", "Table service", "Private occasions"], de: ["Saisonale Speisekarte", "Service am Tisch", "Private Anlässe"], fr: ["Menu de saison", "Service à table", "Occasions privées"], es: ["Menú de temporada", "Servicio en mesa", "Eventos privados"], it: ["Menu stagionale", "Servizio al tavolo", "Occasioni private"],
    },
    "fast-food": {
      en: ["Fresh fast menu", "Takeaway orders", "Local delivery"], de: ["Frische Schnellgerichte", "Bestellungen zum Mitnehmen", "Lokale Lieferung"], fr: ["Menu rapide et frais", "Commandes à emporter", "Livraison locale"], es: ["Menú rápido y fresco", "Pedidos para llevar", "Reparto local"], it: ["Menu veloce e fresco", "Ordini da asporto", "Consegna locale"],
    },
    barber: {
      en: ["Men's haircut", "Beard shaping", "Classic shave"], de: ["Herrenhaarschnitt", "Bartpflege", "Klassische Rasur"], fr: ["Coupe homme", "Taille de barbe", "Rasage classique"], es: ["Corte de caballero", "Arreglo de barba", "Afeitado clásico"], it: ["Taglio uomo", "Regolazione barba", "Rasatura classica"],
    },
    "hair-salon": {
      en: ["Cut and styling", "Colour services", "Hair treatments"], de: ["Schnitt und Styling", "Colorationen", "Haarpflege"], fr: ["Coupe et coiffage", "Colorations", "Soins capillaires"], es: ["Corte y peinado", "Coloración", "Tratamientos capilares"], it: ["Taglio e styling", "Colorazione", "Trattamenti per capelli"],
    },
    beauty: {
      en: ["Personal consultation", "Tailored treatment", "Ongoing care"], de: ["Persönliche Beratung", "Individuelle Behandlung", "Begleitende Pflege"], fr: ["Conseil personnalisé", "Soin sur mesure", "Suivi beauté"], es: ["Asesoramiento personal", "Tratamiento a medida", "Cuidado continuado"], it: ["Consulenza personale", "Trattamento su misura", "Cura continuativa"],
    },
    "medical-practice": {
      en: ["Medical consultation", "Routine check-up", "Personal health guidance"], de: ["Ärztliche Beratung", "Routineuntersuchung", "Persönliche Orientierung"], fr: ["Consultation médicale", "Bilan de routine", "Orientation personnalisée"], es: ["Consulta médica", "Revisión rutinaria", "Orientación personal"], it: ["Consulto medico", "Controllo di routine", "Orientamento personale"],
    },
    "dental-practice": {
      en: ["Dental consultation", "Preventive care visit", "Treatment planning"], de: ["Zahnärztliche Beratung", "Vorsorgetermin", "Behandlungsplanung"], fr: ["Consultation dentaire", "Visite préventive", "Planification du traitement"], es: ["Consulta dental", "Visita preventiva", "Planificación del tratamiento"], it: ["Consulenza dentistica", "Visita preventiva", "Pianificazione del trattamento"],
    },
    "home-care": {
      en: ["Home-care visit", "Everyday mobility support", "Family care coordination"], de: ["Pflegebesuch zu Hause", "Unterstützung im Alltag", "Abstimmung mit Angehörigen"], fr: ["Visite à domicile", "Soutien à la mobilité quotidienne", "Coordination avec la famille"], es: ["Visita a domicilio", "Apoyo a la movilidad diaria", "Coordinación con la familia"], it: ["Visita a domicilio", "Supporto alla mobilità quotidiana", "Coordinamento con la famiglia"],
    },
    psychotherapy: {
      en: ["Initial conversation", "Individual sessions", "Ongoing guidance"], de: ["Erstgespräch", "Einzelgespräche", "Begleitende Orientierung"], fr: ["Premier échange", "Séances individuelles", "Accompagnement continu"], es: ["Primera conversación", "Sesiones individuales", "Orientación continuada"], it: ["Colloquio iniziale", "Sedute individuali", "Orientamento continuativo"],
    },
    physiotherapy: {
      en: ["Initial assessment", "Manual therapy", "Recovery guidance"], de: ["Erstbefund", "Manuelle Therapie", "Rehabilitationsbegleitung"], fr: ["Bilan initial", "Thérapie manuelle", "Accompagnement de rééducation"], es: ["Valoración inicial", "Terapia manual", "Guía de recuperación"], it: ["Valutazione iniziale", "Terapia manuale", "Guida al recupero"],
    },
    professional: {
      en: ["Initial consultation", "Needs analysis", "Ongoing support"], de: ["Erstberatung", "Bedarfsanalyse", "Laufende Begleitung"], fr: ["Consultation initiale", "Analyse des besoins", "Accompagnement continu"], es: ["Consulta inicial", "Análisis de necesidades", "Apoyo continuo"], it: ["Consulenza iniziale", "Analisi delle esigenze", "Supporto continuativo"],
    },
    pet: {
      en: ["Initial consultation", "Tailored care", "Owner guidance"], de: ["Erstberatung", "Individuelle Betreuung", "Beratung für Halter"], fr: ["Consultation initiale", "Soins adaptés", "Conseils aux propriétaires"], es: ["Consulta inicial", "Cuidado adaptado", "Orientación para propietarios"], it: ["Consulenza iniziale", "Cura su misura", "Consigli per i proprietari"],
    },
    cleaning: {
      en: ["Regular cleaning", "Detailed cleaning", "Tailored plan"], de: ["Regelmäßige Reinigung", "Gründliche Reinigung", "Individueller Plan"], fr: ["Nettoyage régulier", "Nettoyage approfondi", "Plan sur mesure"], es: ["Limpieza periódica", "Limpieza detallada", "Plan a medida"], it: ["Pulizia periodica", "Pulizia approfondita", "Piano su misura"],
    },
    electrician: {
      en: ["Electrical inspection", "Installation work", "Maintenance"], de: ["Elektroprüfung", "Installationsarbeiten", "Wartung"], fr: ["Contrôle électrique", "Travaux d’installation", "Maintenance"], es: ["Revisión eléctrica", "Trabajos de instalación", "Mantenimiento"], it: ["Controllo elettrico", "Lavori di installazione", "Manutenzione"],
    },
    plumbing: {
      en: ["System inspection", "Installation work", "Maintenance"], de: ["Anlagenprüfung", "Installationsarbeiten", "Wartung"], fr: ["Contrôle du système", "Travaux d’installation", "Maintenance"], es: ["Revisión del sistema", "Trabajos de instalación", "Mantenimiento"], it: ["Controllo dell’impianto", "Lavori di installazione", "Manutenzione"],
    },
    construction: {
      en: ["Project consultation", "Work coordination", "Finishing and maintenance"], de: ["Projektberatung", "Baukoordination", "Ausbau und Instandhaltung"], fr: ["Conseil de projet", "Coordination des travaux", "Finitions et entretien"], es: ["Consulta de proyecto", "Coordinación de obra", "Acabados y mantenimiento"], it: ["Consulenza di progetto", "Coordinamento lavori", "Finiture e manutenzione"],
    },
    garden: {
      en: ["Site assessment", "Care and pruning", "Seasonal maintenance"], de: ["Bestandsaufnahme", "Pflege und Schnitt", "Saisonale Pflege"], fr: ["Évaluation de l’espace", "Entretien et taille", "Maintenance saisonnière"], es: ["Evaluación del espacio", "Cuidado y poda", "Mantenimiento estacional"], it: ["Valutazione dello spazio", "Cura e potatura", "Manutenzione stagionale"],
    },
    delivery: {
      en: ["Order collection", "Local delivery", "Order tracking"], de: ["Auftragsannahme", "Lokale Lieferung", "Sendungsverfolgung"], fr: ["Prise de commande", "Livraison locale", "Suivi de commande"], es: ["Recogida de pedidos", "Reparto local", "Seguimiento de pedidos"], it: ["Ritiro dell’ordine", "Consegna locale", "Tracciamento dell’ordine"],
    },
  };
  return { ...generic[locale], description: healthDescriptions[kind]?.[locale] ?? description[locale], services: services[kind]?.[locale] ?? generic[locale].services };
}

function rawTrialStarterContent(category: string, locale: SupportedLocale, templateKey?: string): RawStarterContent {
  if (locale !== "sq") return localizedCategoryStarter(category, locale, templateKey);
  const health: Partial<Record<TrialCategory, RawStarterContent>> = {
    "medical-practice": { description: "Praktikë mjekësore për konsultime të kujdesshme, informacion të qartë dhe mbështetje të respektueshme për nevojat e përditshme shëndetësore.", services: ["Konsultë mjekësore", "Kontroll rutinë", "Udhëzim personal"] },
    "dental-practice": { description: "Kujdes dentar i organizuar me konsultim të qartë, planifikim të kujdesshëm dhe informacion të kuptueshëm në çdo hap.", services: ["Konsultë dentare", "Vizitë parandaluese", "Planifikim trajtimi"] },
    "home-care": { description: "Mbështetje e respektueshme në shtëpi, e organizuar sipas rutinës, koordinimit të qartë dhe nevojave të përditshme të secilit person.", services: ["Vizitë në shtëpi", "Mbështetje për lëvizjen", "Koordinim me familjen"] },
    psychotherapy: { description: "Hapësirë konfidenciale për biseda të kujdesshme, orientim të qartë dhe mbështetje të përshtatur me situatën individuale.", services: ["Bisedë fillestare", "Seanca individuale", "Mbështetje e vazhdueshme"] },
  };
  const kind = categoryKind(category, templateKey);
  if (kind && health[kind]) return health[kind];
  const normalized = category.toLowerCase();
  if (kind === "auto-repair" || normalized.includes("car repair")) return { description: "Servis profesional makinash për diagnostikim të saktë, mirëmbajtje të kujdesshme dhe riparime të besueshme.", services: ["Diagnostikim i automjetit", "Mirëmbajtje dhe riparime", "Frena dhe goma"] };
  if (kind === "car-dealership" || normalized.includes("car dealership")) return { description: "Zgjedhje e kujdesshme automjetesh dhe këshillim i qartë nga shikimi i parë deri te dorëzimi.", services: ["Përzgjedhje automjetesh", "Test drive", "Blerje dhe dorëzim"] };
  if (kind === "fast-food" || normalized.includes("fast food")) return { description: "Ushqim i freskët, i përgatitur me ritëm dhe shije për çdo porosi të përditshme.", services: ["Menu e shpejtë", "Porosi për ta marrë", "Dërgesa lokale"] };
  if (kind === "restaurant" || normalized.includes("restaurant")) return { description: "Ushqim i përgatitur me kujdes, mikpritje e ngrohtë dhe shije që ju bëjnë të ktheheni përsëri.", services: ["Menu e veçantë", "Në ambient dhe për ta marrë", "Raste private"] };
  if (kind === "barber" || normalized.includes("barber")) return { description: "Kujdes mashkullor i menduar me stil, prerje të sakta dhe vëmendje për çdo detaj.", services: ["Prerje flokësh", "Rregullim mjekre", "Rruajtje klasike"] };
  if (kind === "hair-salon" || normalized.includes("hair")) return { description: "Kujdes profesional për flokët, konsultim personal dhe stil i përshtatur për çdo klient.", services: ["Prerje dhe stilim", "Ngjyrosje", "Trajtime për flokët"] };
  if (kind === "beauty" || normalized.includes("beauty")) return { description: "Kujdes estetik i menduar me vëmendje, detaje të bukura dhe një përvojë relaksuese në çdo takim.", services: ["Konsultim personal", "Trajtim i përshtatur", "Kujdes i vazhdueshëm"] };
  if (kind === "physiotherapy" || normalized.includes("physio")) return { description: "Mbështetje profesionale për lëvizje më të lirë, rikuperim të kujdesshëm dhe mirëqenie të përditshme.", services: ["Vlerësim fillestar", "Terapi manuale", "Udhëzim për rikuperim"] };
  if (kind === "professional" || normalized.includes("professional")) return { description: "Këshillim i strukturuar dhe zgjidhje praktike për vendime të qarta dhe nevoja konkrete biznesi.", services: ["Konsultim fillestar", "Analizë e nevojave", "Mbështetje e vazhdueshme"] };
  if (kind === "pet" || normalized.includes("pet")) return { description: "Kujdes i vëmendshëm për kafshët dhe udhëzim i qartë për pronarët e tyre.", services: ["Konsultim fillestar", "Kujdes i përshtatur", "Këshillim për pronarët"] };
  if (kind === "cleaning" || normalized.includes("clean")) return { description: "Pastrim i organizuar për ambiente të pastra, të mirëmbajtura dhe të gatshme për përdorim.", services: ["Pastrim periodik", "Pastrim i detajuar", "Plan i përshtatur"] };
  if (kind === "electrician" || normalized.includes("electric")) return { description: "Punime elektrike të organizuara me këshillim të qartë për banesa dhe biznese.", services: ["Kontroll elektrik", "Instalim", "Mirëmbajtje"] };
  if (kind === "plumbing" || normalized.includes("plumb")) return { description: "Zgjidhje praktike për hidraulikë dhe ngrohje, nga kontrolli deri te mirëmbajtja.", services: ["Kontroll i sistemit", "Instalim", "Mirëmbajtje"] };
  if (kind === "construction" || normalized.includes("construction")) return { description: "Mbështetje e strukturuar për projekte ndërtimi, me planifikim të qartë dhe punë të organizuar.", services: ["Konsultim projekti", "Koordinim punimesh", "Përfundime dhe mirëmbajtje"] };
  if (kind === "garden" || normalized.includes("garden") || normalized.includes("tree")) return { description: "Kujdes profesional për kopshte, pemë dhe hapësira të jashtme që duan vëmendje gjatë gjithë vitit.", services: ["Vlerësim i hapësirës", "Kujdes dhe krasitje", "Mirëmbajtje sezonale"] };
  if (kind === "delivery" || normalized.includes("delivery") || normalized.includes("transport")) return { description: "Dërgesa të organizuara dhe komunikim i qartë për porosi lokale dhe nevoja të përditshme.", services: ["Marrje porosie", "Dërgesë lokale", "Ndjekje e porosisë"] };
  return generic.sq;
}

export function trialStarterContent(category: string, locale: SupportedLocale, templateKey?: string): StarterContent {
  const raw = rawTrialStarterContent(category, locale, templateKey);
  const kind = categoryKind(category, templateKey);
  const descriptions = kind ? trialServiceDescriptions[kind][locale] : genericServiceDescriptions[locale];
  return {
    description: raw.description,
    services: raw.services.map((title, index) => ({
      title,
      description: descriptions[index] ?? genericServiceDescriptions[locale][index % 3]!,
    })),
  };
}
