/* ── business-category-registry/1 (BSRC-DESIGN-P4-001) ─────────────────────
   The single source of truth for business categories: 16 families, their
   subcategories, six-locale labels, multilingual search aliases and the
   canonical default template key per entry. Neutral and framework-free:
   no product, person or brand names, no rendering code.

   Contract rules:
   1. Every family and subcategory carries labels for ALL six registry
      locales (de, en, fr, es, it, sq) — enforced by tests.
   2. Every defaultTemplateKey must exist in the live business template
      catalog — enforced by tests; resolution code additionally validates.
   3. Search is deterministic: same query + locale → same ranked result.
   4. Search and the legacy resolver are diacritics-insensitive and work
      across locales (aliases are not locale-tagged).
   5. Unknown keys never throw: resolvers return undefined / the "other"
      family so callers fail safe into the compatibility path. */

import { selectBusinessTemplate } from "./template-catalog";

export const BUSINESS_CATEGORY_REGISTRY_VERSION = "business-category-registry/1";

export const categoryRegistryLocales = ["de", "en", "fr", "es", "it", "sq"] as const;
export type CategoryRegistryLocale = (typeof categoryRegistryLocales)[number];

export const businessCategoryFamilyIds = [
  "construction-trades", "automotive", "beauty-wellness", "food-restaurant",
  "legal-professional", "healthcare", "hospitality", "retail",
  "creative-photography", "home-services", "technology", "education",
  "fitness", "real-estate", "manufacturing-industrial", "other",
] as const;
export type BusinessCategoryFamilyId = (typeof businessCategoryFamilyIds)[number];

export type CategoryLabels = Record<CategoryRegistryLocale, string>;

export type BusinessCategoryFamily = {
  key: BusinessCategoryFamilyId;
  labels: CategoryLabels;
  /** Canonical fallback template when a subcategory carries none. Optional: families without a fitting template stay generic. */
  defaultTemplateKey?: string;
};

export type BusinessCategorySubcategory = {
  key: string;
  family: BusinessCategoryFamilyId;
  labels: CategoryLabels;
  /** Multilingual search aliases (diacritics-insensitive, not locale-tagged). */
  aliases: readonly string[];
  /** Canonical template for generation; falls back to the family default. */
  defaultTemplateKey?: string;
};

export const businessCategoryFamilies: readonly BusinessCategoryFamily[] = [
  {
    key: "construction-trades",
    labels: { en: "Construction & Trades", de: "Bau & Handwerk", fr: "Construction & artisanat", es: "Construcción y oficios", it: "Costruzioni e artigianato", sq: "Ndërtim & zanate" },
    defaultTemplateKey: "construction",
  },
  {
    key: "automotive",
    labels: { en: "Automotive", de: "Auto & Kfz", fr: "Automobile", es: "Automoción", it: "Auto e veicoli", sq: "Automobila" },
    defaultTemplateKey: "auto-repair",
  },
  {
    key: "beauty-wellness",
    labels: { en: "Beauty & Wellness", de: "Schönheit & Wellness", fr: "Beauté & bien-être", es: "Belleza y bienestar", it: "Bellezza e benessere", sq: "Bukuri & mirëqenie" },
    defaultTemplateKey: "beauty-studio",
  },
  {
    key: "food-restaurant",
    labels: { en: "Food & Restaurant", de: "Essen & Restaurant", fr: "Gastronomie & restaurants", es: "Comida y restaurantes", it: "Cibo e ristoranti", sq: "Ushqim & restorante" },
    defaultTemplateKey: "restaurant",
  },
  {
    key: "legal-professional",
    labels: { en: "Legal & Professional Services", de: "Recht & Beratung", fr: "Services juridiques & conseils", es: "Servicios legales y profesionales", it: "Servizi legali e professionali", sq: "Ligj & shërbime profesionale" },
    defaultTemplateKey: "consultant",
  },
  {
    key: "healthcare",
    labels: { en: "Healthcare", de: "Gesundheit & Pflege", fr: "Santé & soins", es: "Salud y cuidados", it: "Salute e cura", sq: "Shëndetësi & kujdes" },
    defaultTemplateKey: "medical-practice",
  },
  {
    key: "hospitality",
    labels: { en: "Hospitality", de: "Gastgewerbe", fr: "Hôtellerie", es: "Hostelería", it: "Ricettività", sq: "Mikëpritje & akomodim" },
  },
  {
    key: "retail",
    labels: { en: "Retail", de: "Handel & Einzelhandel", fr: "Commerce de détail", es: "Comercio minorista", it: "Commercio al dettaglio", sq: "Shitje me pakicë" },
  },
  {
    key: "creative-photography",
    labels: { en: "Creative & Photography", de: "Kreativität & Fotografie", fr: "Création & photographie", es: "Creación y fotografía", it: "Creatività e fotografia", sq: "Krijimtari & fotografi" },
  },
  {
    key: "home-services",
    labels: { en: "Home Services", de: "Hausdienstleistungen", fr: "Services à domicile", es: "Servicios para el hogar", it: "Servizi per la casa", sq: "Shërbime shtëpie & kopshtije" },
    defaultTemplateKey: "home-cleaning",
  },
  {
    key: "technology",
    labels: { en: "Technology", de: "Technologie & IT", fr: "Technologie", es: "Tecnología", it: "Tecnologia", sq: "Teknologji" },
  },
  {
    key: "education",
    labels: { en: "Education", de: "Bildung", fr: "Éducation", es: "Educación", it: "Formazione", sq: "Edukim & trajnim" },
  },
  {
    key: "fitness",
    labels: { en: "Fitness", de: "Fitness", fr: "Fitness", es: "Fitness", it: "Fitness", sq: "Fitnes" },
  },
  {
    key: "real-estate",
    labels: { en: "Real Estate", de: "Immobilien", fr: "Immobilier", es: "Inmobiliaria", it: "Immobiliare", sq: "Pasuri të patundshme" },
  },
  {
    key: "manufacturing-industrial",
    labels: { en: "Manufacturing & Industrial", de: "Fertigung & Industrie", fr: "Fabrication & industrie", es: "Fabricación e industria", it: "Produzione e industria", sq: "Prodhim & industri" },
    defaultTemplateKey: "construction",
  },
  {
    key: "other",
    labels: { en: "Other", de: "Sonstige", fr: "Autres", es: "Otros", it: "Altro", sq: "Të tjera" },
  },
];

export const businessCategorySubcategories: readonly BusinessCategorySubcategory[] = [
  // ── construction-trades ─────────────────────────────────────────────────
  {
    key: "construction", family: "construction-trades", defaultTemplateKey: "construction",
    labels: { en: "Construction", de: "Bauunternehmen", fr: "Entreprise de construction", es: "Empresa constructora", it: "Impresa edile", sq: "Ndërtim" },
    aliases: ["ndertim", "ndertimtari", "kontraktor", "bau", "general contractor", "constructora", "contratista", "impresa di costruzioni", "construction company"],
  },
  {
    key: "metal-construction", family: "construction-trades", defaultTemplateKey: "construction",
    labels: { en: "Metal Construction", de: "Metallbau", fr: "Construction métallique", es: "Construcción metálica", it: "Costruzioni metalliche", sq: "Ndërtim metalik" },
    aliases: ["metallbau", "stahlbau", "metal structures", "konstruksione metalike", "ndertim metalike", "estructuras metalicas", "strutture metalliche", "metalika", "metalike"],
  },
  {
    key: "industrial-construction", family: "construction-trades", defaultTemplateKey: "construction",
    labels: { en: "Industrial Construction", de: "Industriebau", fr: "Construction industrielle", es: "Construcción industrial", it: "Costruzioni industriali", sq: "Ndërtim industrial" },
    aliases: ["industriebau", "metallhallen", "metal halls", "hale industriale", "naves industriales", "capannoni industriali", "halla metalike"],
  },
  {
    key: "house-construction", family: "construction-trades", defaultTemplateKey: "house-construction",
    labels: { en: "House Construction", de: "Hausbau", fr: "Construction de maisons", es: "Construcción de viviendas", it: "Costruzione di case", sq: "Ndërtim shtëpish" },
    aliases: ["hausbau", "residential construction", "ndertim banese", "banesa", "viviendas", "abitazioni", "home building"],
  },
  {
    key: "civil-engineering", family: "construction-trades", defaultTemplateKey: "civil-engineering",
    labels: { en: "Civil Engineering", de: "Tiefbau", fr: "Génie civil", es: "Ingeniería civil", it: "Ingegneria civile", sq: "Inxhinieri civile" },
    aliases: ["tiefbau", "infrastructure", "infrastruktura", "obras civiles", "opere civili", "genie civil"],
  },
  {
    key: "crane-service", family: "construction-trades", defaultTemplateKey: "crane-service",
    labels: { en: "Crane Service", de: "Krandienst", fr: "Service de grues", es: "Servicio de grúas", it: "Servizio di gru", sq: "Shërbim vinçash" },
    aliases: ["krandienst", "autokran", "vinc", "vinca", "grua", "grue", "gruas", "sollevamento", "grúas"],
  },
  {
    key: "fiber-network", family: "construction-trades", defaultTemplateKey: "fiber-network",
    labels: { en: "Fiber Network", de: "Glasfasernetz", fr: "Réseau fibre optique", es: "Red de fibra óptica", it: "Rete in fibra ottica", sq: "Rrjet me fibra" },
    aliases: ["glasfaser", "fiber optic", "fibra ottica", "fibra optica", "fibre optique", "telecom", "rrjeti", "fiber"],
  },
  {
    key: "glass-facade", family: "construction-trades", defaultTemplateKey: "glass-facade",
    labels: { en: "Glass & Facade", de: "Glas- und Fassadenbau", fr: "Vitrage et façades", es: "Vidrio y fachadas", it: "Vetro e facciate", sq: "Xham dhe fasada" },
    aliases: ["fassadenbau", "glasbau", "fasada", "xhami", "facciate", "fachadas", "facade", "glazing"],
  },
  {
    key: "electrician", family: "construction-trades", defaultTemplateKey: "electrician",
    labels: { en: "Electrician", de: "Elektriker", fr: "Électricien", es: "Electricista", it: "Elettricista", sq: "Elektricist" },
    aliases: ["elektriker", "elektro", "elektrike", "punime elektrike", "instalime elektrike", "electrical work", "electricite", "elettricista", "electricista"],
  },
  {
    key: "plumbing-heating", family: "construction-trades", defaultTemplateKey: "plumbing-heating",
    labels: { en: "Plumbing & Heating", de: "Sanitär und Heizung", fr: "Plomberie et chauffage", es: "Fontanería y calefacción", it: "Idraulica e riscaldamento", sq: "Hidraulikë dhe ngrohje" },
    aliases: ["sanitaer", "heizung", "plumber", "plumbing", "hidraulik", "ngrohje", "idraulico", "fontanero", "chauffage", "klimatizim"],
  },
  {
    key: "locksmith", family: "construction-trades", defaultTemplateKey: "locksmith",
    labels: { en: "Locksmith", de: "Schlüsseldienst", fr: "Serrurerie", es: "Cerrajería", it: "Serratureria", sq: "Shërbim çelësash" },
    aliases: ["schluesseldienst", "serrurerie", "cerrajero", "serrature", "celesa", "celes", "key service", "locks"],
  },
  {
    key: "handyman", family: "construction-trades", defaultTemplateKey: "handyman",
    labels: { en: "Handyman", de: "Handwerker-Service", fr: "Dépannage et petits travaux", es: "Servicio de manitas", it: "Servizio tuttofare", sq: "Shërbime të ndryshme" },
    aliases: ["handwerker", "allrounder", "bricolage", "manitas", "tuttofare", "ripertime", "odd jobs", "minor repairs"],
  },

  // ── automotive ─────────────────────────────────────────────────────────
  {
    key: "auto-repair", family: "automotive", defaultTemplateKey: "auto-repair",
    labels: { en: "Auto Repair", de: "Autowerkstatt", fr: "Garage automobile", es: "Taller mecánico", it: "Officina meccanica", sq: "Autoservis" },
    aliases: ["autoservis", "autowerkstatt", "kfz werkstatt", "car service", "auto service", "car repair", "mekanik", "riparime makina", "mekanik makinash", "mechanic", "werkstatt", "officina", "taller", "garage"],
  },
  {
    key: "car-dealership", family: "automotive", defaultTemplateKey: "car-dealership",
    labels: { en: "Car Dealership", de: "Autohaus", fr: "Concession automobile", es: "Concesionario de vehículos", it: "Concessionaria di veicoli", sq: "Sallon makinash" },
    aliases: ["autohaus", "gebrauchtwagen", "shitje makina", "autosallon", "car sales", "used cars", "vehiculos", "vendita auto", "dealership"],
  },

  // ── beauty-wellness ────────────────────────────────────────────────────
  {
    key: "hair-salon", family: "beauty-wellness", defaultTemplateKey: "hair-salon",
    labels: { en: "Hair Salon", de: "Friseursalon", fr: "Salon de coiffure", es: "Peluquería", it: "Parrucchiere", sq: "Salon flokësh" },
    aliases: ["friseur", "haar salon", "coiffeur", "hairdresser", "hair", "floke", "flokë", "peluqueria", "parrucchiere", "salon"],
  },
  {
    key: "barber", family: "beauty-wellness", defaultTemplateKey: "barber",
    labels: { en: "Barber", de: "Barbier", fr: "Barbier", es: "Barbería", it: "Barbiere", sq: "Konbarson" },
    aliases: ["konbarson", "berber", "barbershop", "barber shop", "men grooming", "herrenfriseur", "barberia"],
  },
  {
    key: "nail-studio", family: "beauty-wellness", defaultTemplateKey: "nail-studio",
    labels: { en: "Nail Studio", de: "Nagelstudio", fr: "Studio d'onglerie", es: "Estudio de uñas", it: "Studio unghie", sq: "Studio thonjsh" },
    aliases: ["nagelstudio", "maniküre", "manicure", "pedicure", "thonj", "unas", "unghie", "ongles", "nails"],
  },
  {
    key: "lashes-brows", family: "beauty-wellness", defaultTemplateKey: "lashes-brows",
    labels: { en: "Lashes & Brows", de: "Wimpern und Brauen", fr: "Cils et sourcils", es: "Pestañas y cejas", it: "Ciglia e sopracciglia", sq: "Qerpikë dhe vetulla" },
    aliases: ["wimpern", "brauen", "lashes", "brows", "qerpik", "vetulla", "pestanas", "ciglia", "lash lifting", "lash"],
  },
  {
    key: "beauty-studio", family: "beauty-wellness", defaultTemplateKey: "beauty-studio",
    labels: { en: "Beauty Studio", de: "Kosmetikstudio", fr: "Institut de beauté", es: "Centro de estética", it: "Centro estetico", sq: "Sallon bukurie" },
    aliases: ["kosmetikstudio", "kosmetik", "beauty salon", "bukuri", "estetika", "estetica", "belleza", "cosmetica", "beauty"],
  },
  {
    key: "massage", family: "beauty-wellness", defaultTemplateKey: "massage",
    labels: { en: "Massage", de: "Massagepraxis", fr: "Massage", es: "Masajes", it: "Massaggi", sq: "Masazh" },
    aliases: ["massagen", "masazh", "masaje", "massaggio", "massotherapie", "spa massage", "wellness massage"],
  },
  {
    key: "physiotherapy", family: "beauty-wellness", defaultTemplateKey: "physiotherapy",
    labels: { en: "Physiotherapy", de: "Physiotherapie", fr: "Physiothérapie", es: "Fisioterapia", it: "Fisioterapia", sq: "Fizioterapi" },
    aliases: ["physio", "fizioterapi", "fisio", "kinesitherapie", "rehabilitation", "fizioterapeut"],
  },
  {
    key: "osteopathy", family: "beauty-wellness", defaultTemplateKey: "osteopathy",
    labels: { en: "Osteopathy", de: "Osteopathie", fr: "Ostéopathie", es: "Osteopatía", it: "Osteopatia", sq: "Osteopati" },
    aliases: ["osteopath", "osteopata", "osteopate"],
  },
  {
    key: "nutrition", family: "beauty-wellness", defaultTemplateKey: "nutrition",
    labels: { en: "Nutrition", de: "Ernährungsberatung", fr: "Consultation nutrition", es: "Nutrición", it: "Nutrizione", sq: "Nutricion" },
    aliases: ["ernaehrung", "nutritionist", "dietist", "dietitian", "nutricionist", "nutrizionista", "diet", "ushqim", "dieta"],
  },
  {
    key: "wellness", family: "beauty-wellness", defaultTemplateKey: "wellness",
    labels: { en: "Wellness", de: "Wellnessstudio", fr: "Bien-être", es: "Bienestar", it: "Benessere", sq: "Mirëqenie" },
    aliases: ["wellness studio", "spa", "mireqenie", "benessere", "sauna", "thermen", "wellness"],
  },
  {
    key: "pet-grooming", family: "beauty-wellness", defaultTemplateKey: "pet-grooming",
    labels: { en: "Pet Grooming", de: "Hundesalon", fr: "Toilettage animalier", es: "Peluquería canina", it: "Toelettatura animali", sq: "Kujdes për kafshë" },
    aliases: ["hundesalon", "hundepflege", "dog grooming", "grooming", "kafshe", "kafshë", "pet care", "toelettatura", "pet services"],
  },

  // ── food-restaurant ────────────────────────────────────────────────────
  {
    key: "restaurant", family: "food-restaurant", defaultTemplateKey: "restaurant",
    labels: { en: "Restaurant", de: "Restaurant", fr: "Restaurant", es: "Restaurante", it: "Ristorante", sq: "Restorant" },
    aliases: ["restorant", "ristorante", "restaurante", "gasthaus", "gaststatte", "gaststätte", "trattoria", "pizzeria", "ushqimore", "dining", "fine dining", "bistro"],
  },
  {
    key: "fast-food", family: "food-restaurant", defaultTemplateKey: "fast-food",
    labels: { en: "Fast Food", de: "Fastfood", fr: "Restauration rapide", es: "Comida rápida", it: "Fast food", sq: "Ushqim i shpejtë" },
    aliases: ["burger", "street food", "imbiss", "takeaway", "take away", "pizza", "kebab", "kebap", "snack", "fast food"],
  },

  // ── legal-professional ─────────────────────────────────────────────────
  {
    key: "lawyer", family: "legal-professional", defaultTemplateKey: "lawyer",
    labels: { en: "Lawyer", de: "Rechtsanwalt", fr: "Cabinet d'avocat", es: "Abogado", it: "Studio legale", sq: "Avokat" },
    aliases: ["rechtsanwalt", "anwalt", "kanzlei", "avokat", "avukat", "zyra ligjore", "law firm", "attorney", "avvocato", "abogado", "avocat", "ligjore", "legal"],
  },
  {
    key: "accountant", family: "legal-professional", defaultTemplateKey: "accountant",
    labels: { en: "Accountant", de: "Steuerberater", fr: "Cabinet comptable", es: "Gestoría y asesoría", it: "Studio commercialista", sq: "Kontabilist" },
    aliases: ["steuerberater", "steuer", "tax advisor", "kontabilitet", "comptable", "commercialista", "contabile", "fiscal", "buchhaltung", "accounting"],
  },
  {
    key: "insurance", family: "legal-professional", defaultTemplateKey: "insurance",
    labels: { en: "Insurance", de: "Versicherung", fr: "Agent d'assurance", es: "Correduría de seguros", it: "Agenzia assicurativa", sq: "Sigurime" },
    aliases: ["versicherung", "assurance", "seguros", "assicurazioni", "sigurim", "insurance agency", "asekuracion"],
  },
  {
    key: "architect", family: "legal-professional", defaultTemplateKey: "architect",
    labels: { en: "Architect", de: "Architekturbüro", fr: "Cabinet d'architecte", es: "Estudio de arquitectura", it: "Studio di architettura", sq: "Studio arkitekture" },
    aliases: ["architekt", "arkitekt", "architecte", "arquitecto", "architetto", "architecture", "projektim"],
  },
  {
    key: "consultant", family: "legal-professional", defaultTemplateKey: "consultant",
    labels: { en: "Consultant", de: "Unternehmensberatung", fr: "Cabinet de conseil", es: "Consultoría empresarial", it: "Consulenza aziendale", sq: "Këshillim biznesi" },
    aliases: ["consulting", "unternehmensberater", "konsulencë", "konsulence", "keshillim", "consulenza", "consultoria", "management consulting", "business consulting"],
  },
  {
    key: "consultation", family: "legal-professional", defaultTemplateKey: "consultation",
    labels: { en: "Consultation Services", de: "Allgemeine Beratung", fr: "Services de conseil", es: "Servicios de consultoría", it: "Servizi di consulenza", sq: "Shërbime këshillimi" },
    aliases: ["beratung", "professional services", "sherbime profesionale", "shërbime profesionale", "consulenza", "consultation", "keshill", "advisory"],
  },

  // ── healthcare ─────────────────────────────────────────────────────────
  {
    key: "medical-practice", family: "healthcare", defaultTemplateKey: "medical-practice",
    labels: { en: "Medical Practice", de: "Arztpraxis", fr: "Cabinet médical", es: "Consultorio médico", it: "Studio medico", sq: "Praktikë mjekësore" },
    aliases: ["arzt", "arztpraxis", "doktor", "mjek", "mjeksore", "medico", "doctor", "klinika", "praxis", "medical"],
  },
  {
    key: "dental-practice", family: "healthcare", defaultTemplateKey: "dental-practice",
    labels: { en: "Dental Practice", de: "Zahnarztpraxis", fr: "Cabinet dentaire", es: "Clínica dental", it: "Studio dentistico", sq: "Studio dentar" },
    aliases: ["zahnarzt", "dentist", "stomatolog", "dentare", "dhemb", "dhëmb", "dentista", "dental", "zahn", "dentar"],
  },
  {
    key: "home-care", family: "healthcare", defaultTemplateKey: "home-care",
    labels: { en: "Home Care", de: "Pflegedienst", fr: "Soins à domicile", es: "Cuidado a domicilio", it: "Assistenza domiciliare", sq: "Kujdes në shtëpi" },
    aliases: ["pflege", "altenpflege", "elderly care", "nursing care", "kujdes shtepi", "moshuer", "domiciliare", "care service"],
  },
  {
    key: "psychotherapy", family: "healthcare", defaultTemplateKey: "psychotherapy",
    labels: { en: "Psychotherapy", de: "Psychotherapie", fr: "Cabinet de psychothérapie", es: "Consulta psicológica", it: "Studio di psicoterapia", sq: "Praktikë psikologjike" },
    aliases: ["psychotherapeut", "psycholog", "psikolog", "psicologo", "therapie", "keshillim psikologjik", "counselling", "psychologist", "terapia"],
  },
  {
    key: "veterinary", family: "healthcare", defaultTemplateKey: "veterinary",
    labels: { en: "Veterinary Clinic", de: "Tierarztpraxis", fr: "Cabinet vétérinaire", es: "Clínica veterinaria", it: "Clinica veterinaria", sq: "Klinikë veterinare" },
    aliases: ["tierarzt", "tierklinik", "veterinar", "veterinary", "vet", "mjeksi kafshesh", "animal clinic", "pet services"],
  },
  {
    key: "pet-wellness", family: "healthcare", defaultTemplateKey: "pet-wellness",
    labels: { en: "Pet Wellness", de: "Tierwohl", fr: "Bien-être animal", es: "Bienestar animal", it: "Benessere animale", sq: "Mirëqenie kafshësh" },
    aliases: ["tierwohl", "pet wellness", "animal care", "kafshe wellnes", "pet health"],
  },

  // ── hospitality ────────────────────────────────────────────────────────
  {
    key: "hotel", family: "hospitality",
    labels: { en: "Hotel", de: "Hotel", fr: "Hôtel", es: "Hotel", it: "Albergo", sq: "Hotel" },
    aliases: ["hotels", "akomodim", "accommodation", "hebergement", "alloggio", "hospedaje", "b&b", "guesthouse", "rezervim", "hostel"],
  },

  // ── retail ─────────────────────────────────────────────────────────────
  {
    key: "retail-store", family: "retail",
    labels: { en: "Retail Store", de: "Einzelhandel", fr: "Commerce de détail", es: "Comercio minorista", it: "Negozio al dettaglio", sq: "Dyqan" },
    aliases: ["einzelhandel", "shop", "store", "dyqan", "negozio", "tienda", "boutique", "shitje pakice", "retail"],
  },

  // ── creative-photography ───────────────────────────────────────────────
  {
    key: "photography", family: "creative-photography",
    labels: { en: "Photography", de: "Fotografie", fr: "Photographie", es: "Fotografía", it: "Fotografia", sq: "Fotografi" },
    aliases: ["fotograf", "fotografe", "photographer", "photo studio", "fotostudio", "fotografo", "studio fotografico", "foto", "photo"],
  },

  // ── home-services ──────────────────────────────────────────────────────
  {
    key: "home-cleaning", family: "home-services", defaultTemplateKey: "home-cleaning",
    labels: { en: "Home Cleaning", de: "Haushaltsreinigung", fr: "Ménage à domicile", es: "Limpieza del hogar", it: "Pulizie domestiche", sq: "Pastrim shtëpie" },
    aliases: ["reinigung", "reinigungskraft", "pastrim", "pastrim shtepie", "house cleaning", "limpieza hogar", "pulizie casa", "housekeeping", "cleaning"],
  },
  {
    key: "office-cleaning", family: "home-services", defaultTemplateKey: "office-cleaning",
    labels: { en: "Office Cleaning", de: "Büroreinigung", fr: "Nettoyage de bureaux", es: "Limpieza de oficinas", it: "Pulizie di uffici", sq: "Pastrim zyrash" },
    aliases: ["bueroreinigung", "office cleaning", "pastrim zyre", "limpieza oficinas", "pulizie ufficio"],
  },
  {
    key: "facility-cleaning", family: "home-services", defaultTemplateKey: "facility-cleaning",
    labels: { en: "Facility Cleaning", de: "Gebäudereinigung", fr: "Nettoyage de bâtiments", es: "Limpieza de edificios", it: "Pulizie di stabili", sq: "Pastrim objektesh" },
    aliases: ["gebaeudereinigung", "facility cleaning", "pastrim objekti", "limpieza edificios", "pulizie condominio"],
  },
  {
    key: "window-cleaning", family: "home-services", defaultTemplateKey: "window-cleaning",
    labels: { en: "Window Cleaning", de: "Fensterreinigung", fr: "Nettoyage de vitres", es: "Limpieza de ventanas", it: "Pulizia vetri", sq: "Pastrim xhamash" },
    aliases: ["fensterputzen", "glasreinigung", "window cleaning", "pastrim xhami", "limpieza cristales", "pulizia vetri"],
  },
  {
    key: "tree-service", family: "home-services", defaultTemplateKey: "tree-service",
    labels: { en: "Tree Service", de: "Baumdienst", fr: "Élagage et abattage", es: "Servicio de árboles", it: "Servizio alberi", sq: "Shërbim pemësh" },
    aliases: ["baum", "baumfaellung", "tree service", "tree removal", "peme", "prerje pemes", "elagage", "abbattimento", "tala", "garden and tree care"],
  },
  {
    key: "arboriculture", family: "home-services", defaultTemplateKey: "tree-service",
    labels: { en: "Arboriculture", de: "Baumpflege", fr: "Arboriculture", es: "Arboricultura", it: "Arboricoltura", sq: "Arborikulturë" },
    aliases: ["baum", "arborist", "baumpflege", "baumkletterer", "tree care", "kujdes peme"],
  },
  {
    key: "landscaping", family: "home-services", defaultTemplateKey: "landscaping",
    labels: { en: "Landscaping", de: "Landschaftsbau", fr: "Aménagement paysager", es: "Paisajismo", it: "Giardinaggio paesaggistico", sq: "Peizazh" },
    aliases: ["landschaftsbau", "gartenbau", "landscape", "peizazh", "kopsht", "giardino", "jardin", "paisaje", "baum und strauchpflanzung", "garden design"],
  },
  {
    key: "garden-maintenance", family: "home-services", defaultTemplateKey: "garden-maintenance",
    labels: { en: "Garden Maintenance", de: "Gartenpflege", fr: "Entretien de jardin", es: "Mantenimiento de jardines", it: "Manutenzione del giardino", sq: "Mirëmbajtje kopshti" },
    aliases: ["gartenpflege", "rasen", "lawn care", "kopsht", "giardino", "jardin", "mirembajtje kopshti"],
  },
  {
    key: "irrigation", family: "home-services", defaultTemplateKey: "irrigation",
    labels: { en: "Irrigation", de: "Bewässerung", fr: "Irrigation", es: "Riego", it: "Irrigazione", sq: "Ujitje" },
    aliases: ["bewaesserung", "sprinkler", "ujitje", "sistemi ujitjes", "riego", "irrigazione", "watering"],
  },
  {
    key: "courier", family: "home-services", defaultTemplateKey: "courier",
    labels: { en: "Courier", de: "Kurierdienst", fr: "Coursier", es: "Mensajería", it: "Corriere", sq: "Kurier" },
    aliases: ["kurier", "courier service", "paketa", "dërgesa", "dergesa", "package delivery", "corriere espresso", "mensajeria", "parcel"],
  },
  {
    key: "moving", family: "home-services", defaultTemplateKey: "moving",
    labels: { en: "Moving & Relocation", de: "Umzug", fr: "Déménagement", es: "Mudanzas", it: "Trasloco", sq: "Zhvendosje" },
    aliases: ["umzug", "zhvendosje", "mudanza", "trasloco", "demenagement", "moving company", "transport shtepie", "relocation"],
  },
  {
    key: "local-delivery", family: "home-services", defaultTemplateKey: "local-delivery",
    labels: { en: "Local Delivery", de: "Lokaler Lieferdienst", fr: "Livraison locale", es: "Reparto local", it: "Consegna locale", sq: "Dërgesa lokale" },
    aliases: ["lieferdienst", "delivery", "transport", "consegna", "reparto", "dorezim", "delivery and transport", "transport dhe dergesa"],
  },

  // ── technology ─────────────────────────────────────────────────────────
  {
    key: "it-services", family: "technology",
    labels: { en: "IT Services", de: "IT-Dienstleistungen", fr: "Services informatiques", es: "Servicios informáticos", it: "Servizi informatici", sq: "Shërbime IT" },
    aliases: ["it", "it support", "computer", "kompjuter", "informatica", "software", "rrjet kompjuterik", "tech support"],
  },

  // ── education ──────────────────────────────────────────────────────────
  {
    key: "tutoring", family: "education",
    labels: { en: "Tutoring", de: "Nachhilfe", fr: "Cours particuliers", es: "Clases particulares", it: "Ripetizioni", sq: "Mësim privat" },
    aliases: ["nachhilfe", "private lessons", "mesim", "mesime", "mesim privat", "ripetizioni", "tutor", "academy"],
  },
  {
    key: "driving-school", family: "education",
    labels: { en: "Driving School", de: "Fahrschule", fr: "Auto-école", es: "Autoescuela", it: "Autoscuola", sq: "Shkollë vozitjeje" },
    aliases: ["fahrschule", "vozitje", "patente", "patenta", "autoscuola", "autoescuela", "driving lessons", "shkolla vozitjes"],
  },
  {
    key: "dog-training", family: "education", defaultTemplateKey: "dog-training",
    labels: { en: "Dog Training", de: "Hundeschule", fr: "Dressage canin", es: "Adiestramiento canino", it: "Addestramento cani", sq: "Trajnim qensh" },
    aliases: ["hundeschule", "dog school", "qen", "trajnim qeni", "adiestramiento", "addestramento", "puppy school", "dog training"],
  },

  // ── fitness ────────────────────────────────────────────────────────────
  {
    key: "gym", family: "fitness",
    labels: { en: "Gym", de: "Fitnessstudio", fr: "Salle de sport", es: "Gimnasio", it: "Palestra", sq: "Palestër" },
    aliases: ["fitnessstudio", "fitness center", "palestra", "gimnasio", "palester", "fitnes", "workout", "fitness"],
  },
  {
    key: "personal-trainer", family: "fitness",
    labels: { en: "Personal Trainer", de: "Personal Trainer", fr: "Coach sportif", es: "Entrenador personal", it: "Personal trainer", sq: "Trajner personal" },
    aliases: ["personal training", "coach", "trajner", "trajnim", "entrenador", "allenamento", "fitness coach"],
  },

  // ── real-estate ────────────────────────────────────────────────────────
  {
    key: "real-estate-agency", family: "real-estate",
    labels: { en: "Real Estate Agency", de: "Immobilienbüro", fr: "Agence immobilière", es: "Inmobiliaria", it: "Agenzia immobiliare", sq: "Agjensi pasurish" },
    aliases: ["immobilien", "makler", "pasuri", "pasuri te patundshme", "immobiliare", "inmobiliaria", "property", "real estate", "agjensi"],
  },

  // ── manufacturing-industrial ───────────────────────────────────────────
  {
    key: "steel-fabrication", family: "manufacturing-industrial",
    labels: { en: "Steel Fabrication", de: "Stahlbau", fr: "Fabrication métallique", es: "Fabricación de acero", it: "Carpenteria metallica", sq: "Fabrikim çeliku" },
    aliases: ["stahlbau", "metallbau", "metal fabrication", "steel works", "celik", "çelik", "metalli", "metal processing", "metalworking"],
  },
  {
    key: "manufacturing", family: "manufacturing-industrial",
    labels: { en: "Manufacturing", de: "Fertigung", fr: "Fabrication", es: "Fabricación", it: "Produzione industriale", sq: "Prodhim industrial" },
    aliases: ["metal manufacturing", "industrial manufacturing", "prodhim", "fabrika", "fabrica", "produzione", "industrial production", "metal"],
  },

  // ── other ──────────────────────────────────────────────────────────────
  {
    key: "luxury-boutique", family: "other", defaultTemplateKey: "gold-luxury",
    labels: { en: "Luxury Boutique", de: "Luxusboutique", fr: "Boutique de luxe", es: "Boutique de lujo", it: "Boutique di lusso", sq: "Butik luksoz" },
    aliases: ["luxus", "luxe", "luks", "luxury", "premium", "boutique", "gold", "butik"],
  },
];

/* ── normalization ──────────────────────────────────────────────────────── */

/** Diacritics- and case-insensitive, punctuation-collapsing search text. */
export function normalizeCategoryText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/giu, " ")
    .trim();
}

/* ── lookups ────────────────────────────────────────────────────────────── */

const familyByKey = new Map<string, BusinessCategoryFamily>(businessCategoryFamilies.map((family) => [family.key, family]));
const subcategoryByKey = new Map<string, BusinessCategorySubcategory>(businessCategorySubcategories.map((subcategory) => [subcategory.key, subcategory]));

export const isBusinessCategoryFamilyId = (value: unknown): value is BusinessCategoryFamilyId =>
  typeof value === "string" && (businessCategoryFamilyIds as readonly string[]).includes(value);

export const businessCategoryFamily = (key: string): BusinessCategoryFamily | undefined => familyByKey.get(key);
export const businessCategorySubcategory = (key: string): BusinessCategorySubcategory | undefined => subcategoryByKey.get(key);

export const subcategoriesForFamily = (familyKey: BusinessCategoryFamilyId): BusinessCategorySubcategory[] =>
  businessCategorySubcategories.filter((subcategory) => subcategory.family === familyKey);

export const subcategoryLabel = (subcategory: BusinessCategorySubcategory, locale: CategoryRegistryLocale): string =>
  subcategory.labels[locale] ?? subcategory.labels.en;
export const familyLabel = (family: BusinessCategoryFamily, locale: CategoryRegistryLocale): string =>
  family.labels[locale] ?? family.labels.en;

export const subcategoryDefaultTemplateKey = (subcategory: BusinessCategorySubcategory): string | undefined =>
  subcategory.defaultTemplateKey ?? businessCategoryFamily(subcategory.family)?.defaultTemplateKey;

/** First (deterministic) subcategory whose canonical template is this key. */
export const subcategoryForTemplateKey = (templateKey: string): BusinessCategorySubcategory | undefined =>
  businessCategorySubcategories.find((subcategory) => subcategory.defaultTemplateKey === templateKey)
    ?? businessCategorySubcategories.find((subcategory) => subcategoryDefaultTemplateKey(subcategory) === templateKey);

export const familyForTemplateKey = (templateKey: string): BusinessCategoryFamily | undefined => {
  const subcategory = subcategoryForTemplateKey(templateKey);
  if (subcategory) return businessCategoryFamily(subcategory.family);
  return businessCategoryFamilies.find((family) => family.defaultTemplateKey === templateKey);
};

/* ── search ─────────────────────────────────────────────────────────────── */

export type BusinessCategorySuggestion = {
  categoryKey: BusinessCategoryFamilyId;
  subcategoryKey: string;
  label: string;
  familyLabel: string;
  score: number;
};

type ScoredMatch = { suggestion: BusinessCategorySuggestion; sortLabel: string };

const wordPrefix = (term: string, query: string): boolean =>
  term.split(" ").some((token) => token.startsWith(query));

/** Deterministic multilingual search over canonical keys, labels and aliases. */
export function searchBusinessCategories(
  query: string,
  locale: CategoryRegistryLocale = "en",
  limit = 8,
): BusinessCategorySuggestion[] {
  const normalizedQuery = normalizeCategoryText(query);
  if (normalizedQuery.length < 2) return [];
  const matches: ScoredMatch[] = [];
  for (const subcategory of businessCategorySubcategories) {
    let best = 0;
    const candidates: Array<{ term: string; base: number; bonus: number }> = [
      { term: normalizeCategoryText(subcategory.key), base: 40, bonus: 0 },
    ];
    for (const [entryLocale, label] of Object.entries(subcategory.labels) as Array<[CategoryRegistryLocale, string]>) {
      candidates.push({ term: normalizeCategoryText(label), base: 100, bonus: entryLocale === locale ? 8 : 0 });
    }
    for (const alias of subcategory.aliases) {
      const normalizedAlias = normalizeCategoryText(alias);
      const localeLabel = normalizeCategoryText(subcategory.labels[locale]);
      candidates.push({ term: normalizedAlias, base: 80, bonus: normalizedAlias === localeLabel ? 3 : 0 });
    }
    for (const { term, base, bonus } of candidates) {
      if (!term) continue;
      let score = 0;
      if (term === normalizedQuery) score = base + bonus;
      else if (wordPrefix(term, normalizedQuery)) score = Math.max(50, base - 10) + bonus;
      else if (term.includes(normalizedQuery)) score = 40 + bonus;
      if (score > best) best = score;
    }
    if (best > 0) {
      const family = familyByKey.get(subcategory.family);
      if (!family) continue;
      matches.push({
        suggestion: {
          categoryKey: subcategory.family,
          subcategoryKey: subcategory.key,
          label: subcategoryLabel(subcategory, locale),
          familyLabel: familyLabel(family, locale),
          score: best,
        },
        sortLabel: normalizeCategoryText(subcategory.labels[locale]),
      });
    }
  }
  matches.sort((left, right) =>
    right.suggestion.score - left.suggestion.score
    || left.sortLabel.localeCompare(right.sortLabel)
    || left.suggestion.subcategoryKey.localeCompare(right.suggestion.subcategoryKey));
  return matches.slice(0, limit).map(({ suggestion }) => suggestion);
}

/* ── canonical / legacy resolution ──────────────────────────────────────── */

export type ResolvedBusinessCategory = {
  categoryKey: BusinessCategoryFamilyId | undefined;
  subcategoryKey: string | undefined;
};

/** Validates already-canonical keys; unknown keys are dropped (fail-safe). */
export function resolveBusinessCategoryKeys(input: {
  categoryKey?: unknown;
  subcategoryKey?: unknown;
}): ResolvedBusinessCategory {
  const subcategory = typeof input.subcategoryKey === "string" ? businessCategorySubcategory(input.subcategoryKey) : undefined;
  if (subcategory) return { categoryKey: subcategory.family, subcategoryKey: subcategory.key };
  const family = isBusinessCategoryFamilyId(input.categoryKey) ? businessCategoryFamily(input.categoryKey) : undefined;
  return { categoryKey: family?.key, subcategoryKey: undefined };
}

/** Best canonical match for a legacy free-text category string; "other" fallback. */
export function resolveLegacyBusinessCategory(category?: unknown): ResolvedBusinessCategory {
  if (typeof category !== "string" || !category.trim()) return { categoryKey: "other", subcategoryKey: undefined };
  const trimmed = category.trim();
  const exact = businessCategorySubcategory(trimmed);
  if (exact) return { categoryKey: exact.family, subcategoryKey: exact.key };
  const suggestion = searchBusinessCategories(trimmed, "en", 1)[0];
  if (suggestion) return { categoryKey: suggestion.categoryKey, subcategoryKey: suggestion.subcategoryKey };
  // Compatibility bridge to the template catalog's keyword matcher; the
  // resolved template key maps back into the registry deterministically.
  const templateKey = selectBusinessTemplateForCategory(trimmed);
  const viaTemplate = templateKey ? subcategoryForTemplateKey(templateKey) : undefined;
  if (viaTemplate) return { categoryKey: viaTemplate.family, subcategoryKey: viaTemplate.key };
  return { categoryKey: "other", subcategoryKey: undefined };
}

const selectBusinessTemplateForCategory = (category: string): string | undefined =>
  selectBusinessTemplate(category)?.key;

/** Canonical template key for stored category keys, validated by the caller against the live catalog. */
export function canonicalTemplateKeyFor(input: {
  categoryKey?: unknown;
  subcategoryKey?: unknown;
}): string | undefined {
  const { subcategoryKey, categoryKey } = resolveBusinessCategoryKeys(input);
  if (subcategoryKey) {
    const subcategory = businessCategorySubcategory(subcategoryKey);
    const templateKey = subcategory ? subcategoryDefaultTemplateKey(subcategory) : undefined;
    if (templateKey) return templateKey;
  }
  if (categoryKey) {
    const family = businessCategoryFamily(categoryKey);
    if (family?.defaultTemplateKey) return family.defaultTemplateKey;
  }
  return undefined;
}
