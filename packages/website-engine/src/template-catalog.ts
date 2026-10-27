import type { SiteDocument, SiteTemplate, ThemeSelection } from "./contracts";

export type BusinessTemplate = {
  key: string;
  layout: SiteTemplate;
  heroImageUrl: string;
  match: readonly string[];
  theme: SiteDocument["theme"];
  preferredTheme?: Exclude<ThemeSelection, "auto">;
  starterMedia?: {
    serviceImageUrls: readonly [string, string, string];
    galleryImageUrls?: readonly string[];
  };
  starterContent?: {
    description: string;
    services: readonly [string, string, string];
  };
};

const theme = (
  primary: string,
  accent: string,
  background: string,
  surface: string,
  text: string,
): SiteDocument["theme"] => ({ primary, accent, background, surface, text });

// This catalog is deliberately standalone: selection and rendering require no
// product-specific code or runtime dependency.
export const businessTemplates: readonly BusinessTemplate[] = [
  {
    key: "gold-luxury",
    layout: "studio",
    heroImageUrl: "/images/templates/wl-hair-noir-v1.png",
    match: ["luxury", "premium", "boutique"],
    preferredTheme: "gold",
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-hair-editorial-v1.png",
        "/images/templates/wl-hair-lumen-v1.png",
        "/images/templates/wl-beauty-hair-salon-v1.webp",
      ],
    },
    theme: theme("#11100e", "#c9a45d", "#15130f", "#211d15", "#f5efe2"),
  },
  {
    key: "barber",
    layout: "studio",
    heroImageUrl: "/images/templates/wl-beauty-barber-v1.webp",
    match: ["barber", "barbershop", "men's grooming", "mens grooming", "herrenfriseur", "herren salon"],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-barber-haircut-v1.webp",
        "/images/templates/wl-barber-beard-v1.webp",
        "/images/templates/wl-barber-hot-towel-v1.webp",
      ],
    },
    theme: theme("#151311", "#d39a4a", "#141210", "#201c18", "#f5efe6"),
  },
  {
    key: "hair-salon",
    layout: "studio",
    heroImageUrl: "/images/templates/wl-beauty-hair-salon-v1.webp",
    match: ["hair salon", "hairdresser", "friseur", "coiffeur"],
    preferredTheme: "gold",
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-hair-editorial-v1.png",
        "/images/templates/wl-hair-lumen-v1.png",
        "/images/templates/wl-hair-noir-v1.png",
      ],
    },
    theme: theme("#2b2521", "#b86f4c", "#f5efe7", "#fffcf7", "#251e1a"),
  },
  {
    key: "nail-studio",
    layout: "studio",
    heroImageUrl: "/images/templates/wl-beauty-nails-v1.webp",
    match: [
      "nail", "manicure", "manikure", "nagelstudio", "nageldesign",
      "onglerie", "manucure", "unas", "uñas", "estetica unghie",
      "thonj", "studio thonjsh",
    ],
    preferredTheme: "gold",
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-nail-studio-manicure-v1.webp",
        "/images/templates/wl-nail-studio-nail-art-v1.webp",
        "/images/templates/wl-nail-studio-pedicure-v1.webp",
      ],
    },
    starterContent: {
      description:
        "Careful nail treatments, precise technique and polished results tailored to your style.",
      services: ["Professional manicure", "Bespoke nail design", "Pedicure care"],
    },
    theme: theme("#282247", "#5750d9", "#fff7fa", "#ffffff", "#272133"),
  },
  {
    key: "lashes-brows",
    layout: "studio",
    heroImageUrl: "/images/templates/wl-beauty-lashes-brows-v1.webp",
    match: [
      "lashes", "brows", "eyelash", "lash studio", "wimpernstudio", "augenbrauen",
      "cils", "sourcils", "pestanas", "pestañas", "cejas", "ciglia", "sopracciglia",
      "qerpik", "vetulla",
    ],
    preferredTheme: "gold",
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-lashes-brows-extensions-v1.webp",
        "/images/templates/wl-lashes-brows-shaping-v1.webp",
        "/images/templates/wl-lashes-brows-lift-v1.webp",
      ],
    },
    starterContent: {
      description:
        "Precision lash and brow treatments designed to enhance your natural features.",
      services: ["Lash extensions", "Brow shaping", "Lash lift and tint"],
    },
    theme: theme("#35252d", "#c86a8a", "#fff8fa", "#ffffff", "#2d2027"),
  },
  {
    key: "beauty-studio",
    layout: "studio",
    heroImageUrl: "/images/templates/wl-beauty-studio-v1.webp",
    match: [
      "cosmetic", "kosmetik", "kosmetikstudio", "beauty studio", "beauty salon",
      "institut de beaute", "institut de beauté", "centro estetico", "centro estético",
      "istituto di bellezza", "sallon bukurie", "qender estetike", "qendër estetike",
    ],
    preferredTheme: "gold",
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-beauty-studio-facial-v1.webp",
        "/images/templates/wl-beauty-studio-consultation-v1.webp",
        "/images/templates/wl-beauty-studio-finishing-care-v1.webp",
      ],
    },
    starterContent: {
      description:
        "Personalised beauty care combining thoughtful consultation, professional treatment and attentive finishing.",
      services: ["Signature facial", "Skin consultation", "Finishing care ritual"],
    },
    theme: theme("#51323d", "#d88b9d", "#fff9f7", "#ffffff", "#34232a"),
  },

  {
    key: "fast-food",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-fast-food-hero-v1.webp",
    match: ["fast food", "fast-food", "street food", "burger", "imbiss", "takeaway", "take away", "snack bar"],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-fast-food-burger-v1.webp",
        "/images/templates/wl-fast-food-fries-v1.webp",
        "/images/templates/wl-fast-food-wrap-v1.webp",
      ],
    },
    theme: theme("#1b1715", "#ef4b32", "#100f0e", "#211b18", "#fff6ea"),
  },
  {
    key: "restaurant",
    layout: "studio",
    heroImageUrl: "/images/templates/wl-restaurant-hero-v1.webp",
    match: ["restaurant", "ristorante", "restaurante", "gastronomie", "gaststatte", "gaststätte", "fine dining", "bistro"],
    preferredTheme: "gold",
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-restaurant-seasonal-menu-v1.webp",
        "/images/templates/wl-restaurant-dining-v1.webp",
        "/images/templates/wl-restaurant-dessert-v1.webp",
      ],
    },
    theme: theme("#1b211b", "#b99455", "#f7f2e8", "#fffdf8", "#24271f"),
  },
  {
    key: "auto-repair",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-auto-repair-hero-v1.webp",
    match: [
      "auto repair", "car repair", "mechanic", "garage", "workshop",
      "autowerkstatt", "kfz werkstatt", "kfz-werkstatt", "kfz service", "autoservice",
      "mecanique auto", "garage automobile", "taller mecanico", "taller mecánico",
      "officina auto", "officina meccanica", "servis makinash", "autoservis", "mekanik",
    ],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-auto-repair-diagnostics-v1.webp",
        "/images/templates/wl-auto-repair-engine-v1.webp",
        "/images/templates/wl-auto-repair-brakes-v1.webp",
      ],
    },
    starterContent: {
      description:
        "Accurate diagnostics, dependable repairs and transparent vehicle care from experienced technicians.",
      services: ["Vehicle diagnostics", "Maintenance and repairs", "Brakes and tyres"],
    },
    theme: theme("#171a1d", "#df3f35", "#f4f5f6", "#ffffff", "#202428"),
  },
  {
    key: "car-dealership",
    layout: "studio",
    heroImageUrl: "/images/templates/wl-car-dealership-hero-v1.webp",
    match: [
      "car dealership", "car dealer", "vehicle sales", "used cars", "auto sales",
      "autohaus", "autohandel", "autohandler", "autohändler", "gebrauchtwagen",
      "concession automobile", "concessionnaire", "concesionario", "vendita auto",
      "concessionaria", "sallon makinash", "shitje makinash", "autosallon",
    ],
    preferredTheme: "gold",
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-car-dealership-consultation-v1.webp",
        "/images/templates/wl-car-dealership-test-drive-v1.webp",
        "/images/templates/wl-car-dealership-handover-v1.webp",
      ],
    },
    starterContent: {
      description:
        "Carefully selected vehicles, clear advice and a professional buying experience from first visit to handover.",
      services: ["Vehicle selection", "Test drive", "Purchase and handover"],
    },
    theme: theme("#17191b", "#b69761", "#f5f2ec", "#ffffff", "#202326"),
  },
  {
    key: "medical-practice",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-health-medical-practice-hero-v1.png",
    match: [
      "medical practice", "general practitioner", "family doctor", "doctor", "physician",
      "arzt", "hausarzt", "allgemeinmedizin", "arztpraxis", "medecin", "medico", "medico di base", "mjek", "mjekesi", "mjekësi",
    ],
    starterMedia: { serviceImageUrls: [
      "/images/templates/wl-medical-practice-consultation-v1.png",
      "/images/templates/wl-medical-practice-checkup-v1.png",
      "/images/templates/wl-medical-practice-guidance-v1.png",
    ] },
    starterContent: {
      description: "A professional medical practice focused on attentive consultations, clear information and respectful everyday care.",
      services: ["Medical consultation", "Routine check-up", "Personal health guidance"],
    },
    theme: theme("#24465a", "#5fa9b9", "#f3f8fa", "#ffffff", "#203845"),
  },
  {
    key: "dental-practice",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-health-dental-practice-hero-v1.png",
    match: [
      "dentist", "dental", "dental practice", "dental clinic", "zahnarzt", "zahnarztpraxis", "zahnmedizin",
      "cabinet dentaire", "dentiste", "clinica dental", "clínica dental", "dentista", "studio dentistico", "stomatolog", "stomatologji",
    ],
    starterMedia: { serviceImageUrls: [
      "/images/templates/wl-dental-practice-consultation-v1.png",
      "/images/templates/wl-dental-practice-preparation-v1.png",
      "/images/templates/wl-dental-practice-review-v1.png",
    ] },
    starterContent: {
      description: "A modern dental practice with calm consultations, careful treatment planning and clear information at every visit.",
      services: ["Dental consultation", "Preventive care visit", "Treatment planning"],
    },
    theme: theme("#31515d", "#6bb5bd", "#f2faf9", "#ffffff", "#203943"),
  },
  {
    key: "home-care",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-health-home-care-hero-v1.png",
    match: [
      "home care", "elderly care", "senior care", "care service", "nursing service", "ambulatory care",
      "altenpflege", "ambulante pflege", "pflegedienst", "seniorenbetreuung", "pflege zuhause",
      "aide a domicile", "aide à domicile", "assistenza domiciliare", "cuidado a domicilio",
      "kujdes ne shtepi", "kujdes në shtëpi", "kujdes per te moshuarit", "kujdes për të moshuarit",
    ],
    starterMedia: { serviceImageUrls: [
      "/images/templates/wl-home-care-visit-v1.png",
      "/images/templates/wl-home-care-mobility-v1.png",
      "/images/templates/wl-home-care-family-plan-v1.png",
    ] },
    starterContent: {
      description: "Respectful support at home, planned around everyday routines, clear coordination and the individual needs of each person.",
      services: ["Home-care visit", "Everyday mobility support", "Family care coordination"],
    },
    theme: theme("#35514b", "#8aac8a", "#f4f8f3", "#ffffff", "#263d37"),
  },
  {
    key: "psychotherapy",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-health-therapy-practice-hero-v1.png",
    match: [
      "psychotherapy", "psychotherapist", "psychology", "psychologist", "therapy practice", "counselling",
      "psychotherapie", "psychologe", "psychologin", "psychologue", "psychologie", "psicologo", "psicologia", "psicoterapeuta", "psicoterapia", "psikolog", "psikoterapi",
    ],
    starterMedia: { serviceImageUrls: [
      "/images/templates/wl-therapy-practice-space-v1.png",
      "/images/templates/wl-therapy-practice-conversation-v1.png",
      "/images/templates/wl-therapy-practice-notes-v1.png",
    ] },
    starterContent: {
      description: "A confidential practice for thoughtful conversations, clear orientation and support shaped around the individual situation.",
      services: ["Initial conversation", "Individual sessions", "Ongoing guidance"],
    },
    theme: theme("#51475f", "#9d8bb6", "#f8f6fa", "#ffffff", "#372f42"),
  },
  {
    key: "physiotherapy",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-wellness-physiotherapy-v1.webp",
    match: [
      "physiotherapy", "physical therapist", "physical therapy", "physio", "physiotherapie", "krankengymnastik",
      "kinesitherapie", "kinésithérapie", "fisioterapia", "fizioterapi",
    ],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-physiotherapy-assessment-v1.webp",
        "/images/templates/wl-physiotherapy-manual-therapy-v1.webp",
        "/images/templates/wl-physiotherapy-rehabilitation-v1.webp",
      ],
    },
    starterContent: {
      description:
        "Individual physiotherapy focused on careful assessment, confident movement and practical recovery support.",
      services: ["Movement assessment", "Manual therapy", "Guided rehabilitation"],
    },
    theme: theme("#174b55", "#4db6ac", "#f4fbfa", "#ffffff", "#173335"),
  },
  {
    key: "osteopathy",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-wellness-osteopathy-v1.webp",
    match: ["osteopathy", "osteopath", "osteopathie", "osteopatia", "osteopati"],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-osteopathy-consultation-v1.webp",
        "/images/templates/wl-osteopathy-treatment-v1.webp",
        "/images/templates/wl-osteopathy-mobility-v1.webp",
      ],
    },
    starterContent: {
      description:
        "Thoughtful osteopathic care combining personal consultation, gentle hands-on treatment and mobility guidance.",
      services: ["Osteopathic consultation", "Hands-on treatment", "Mobility guidance"],
    },
    theme: theme("#3d4c43", "#97ae86", "#f5f7f1", "#ffffff", "#28332c"),
  },
  {
    key: "massage",
    layout: "studio",
    heroImageUrl: "/images/templates/wl-wellness-massage-v1.webp",
    match: ["massage", "massag", "massagestudio", "masaje", "massaggio", "masazh"],
    preferredTheme: "gold",
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-massage-relaxation-v1.webp",
        "/images/templates/wl-massage-focused-v1.webp",
        "/images/templates/wl-massage-sports-v1.webp",
      ],
    },
    starterContent: {
      description:
        "Professional massage treatments shaped around relaxation, focused care and active recovery.",
      services: ["Relaxation massage", "Focused massage", "Sports massage"],
    },
    theme: theme("#62483e", "#c69270", "#fff8f2", "#ffffff", "#35251e"),
  },
  {
    key: "nutrition",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-wellness-nutrition-v1.webp",
    match: [
      "nutrition", "ernahrung", "ernährung", "ernahrungsberatung", "ernährungsberatung",
      "dietitian", "nutritionist", "dietetique", "diététique", "nutricion", "nutrición",
      "nutrizione", "dietolog", "ushqyerje",
    ],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-nutrition-consultation-v1.webp",
        "/images/templates/wl-nutrition-meal-planning-v1.webp",
        "/images/templates/wl-nutrition-coaching-v1.webp",
      ],
    },
    starterContent: {
      description:
        "Practical nutrition support built around personal goals, balanced planning and sustainable everyday habits.",
      services: ["Nutrition consultation", "Personal meal planning", "Follow-up coaching"],
    },
    theme: theme("#3d5a3d", "#9caf56", "#f7faef", "#ffffff", "#283527"),
  },
  {
    key: "wellness",
    layout: "studio",
    heroImageUrl: "/images/templates/wl-wellness-studio-v1.webp",
    match: [
      "wellness", "yoga", "spa", "wellnessstudio", "relaxation", "entspannung",
      "bien-etre", "bien-être", "bienestar", "benessere", "mireqenie", "mirëqenie",
    ],
    preferredTheme: "gold",
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-wellness-yoga-v1.webp",
        "/images/templates/wl-wellness-hand-ritual-v1.webp",
        "/images/templates/wl-wellness-relaxation-v1.webp",
      ],
    },
    starterContent: {
      description:
        "A calm wellness space for restorative movement, considered rituals and guided relaxation.",
      services: ["Restorative movement", "Wellness ritual", "Guided relaxation"],
    },
    theme: theme("#433d62", "#a69adf", "#f7f6ff", "#ffffff", "#2c2940"),
  },

  {
    key: "lawyer",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-professional-lawyer-v1.webp",
    match: [
      "lawyer", "attorney", "legal firm", "legal advice", "rechtsanwalt", "kanzlei",
      "anwalt", "avocat", "abogado", "abogada", "avvocato", "jurist", "avokat",
    ],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-lawyer-consultation-v1.webp",
        "/images/templates/wl-lawyer-documents-v1.webp",
        "/images/templates/wl-lawyer-strategy-v1.webp",
      ],
    },
    starterContent: {
      description:
        "Clear legal guidance, careful preparation and personal representation for important decisions.",
      services: ["Initial legal consultation", "Document review", "Case strategy"],
    },
    theme: theme("#1f2e43", "#b38b4d", "#f7f8fa", "#ffffff", "#202a38"),
  },
  {
    key: "accountant",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-professional-accountant-v1.webp",
    match: [
      "accountant", "tax advisor", "bookkeeping", "steuer", "steuerberater", "buchhaltung",
      "comptable", "fiscaliste", "contable", "contabilidad", "contabilitÃ ", "commercialista", "kontabilist",
    ],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-accountant-review-v1.webp",
        "/images/templates/wl-accountant-tax-v1.webp",
        "/images/templates/wl-accountant-planning-v1.webp",
      ],
    },
    starterContent: {
      description:
        "Reliable accounting and tax support with clear figures, structured processes and personal advice.",
      services: ["Financial review", "Tax preparation", "Business planning"],
    },
    theme: theme("#263d4b", "#7196ad", "#f5f8fa", "#ffffff", "#20323d"),
  },
  {
    key: "insurance",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-professional-insurance-v1.webp",
    match: [
      "insurance", "insurance broker", "insurance agent", "versicherung", "versicherungsagentur",
      "assurance", "assureur", "seguros", "aseguradora", "assicurazione", "assicuratore", "sigurime", "sigurim",
    ],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-insurance-consultation-v1.webp",
        "/images/templates/wl-insurance-risk-review-v1.webp",
        "/images/templates/wl-insurance-claims-support-v1.webp",
      ],
    },
    starterContent: {
      description:
        "Clear insurance advice and practical protection shaped around the risks that matter to you.",
      services: ["Coverage consultation", "Risk review", "Claims support"],
    },
    theme: theme("#26394b", "#6394bd", "#f6f9fc", "#ffffff", "#202d3a"),
  },
  {
    key: "architect",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-professional-architect-v1.webp",
    match: ["architect", "architecture", "architekt", "architekturbÃ¼ro", "architecte", "arquitecto", "architetto", "arkitekt"],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-architect-consultation-v1.webp",
        "/images/templates/wl-architect-design-planning-v1.webp",
        "/images/templates/wl-architect-site-review-v1.webp",
      ],
    },
    starterContent: {
      description:
        "Thoughtful architecture balancing clear planning, considered design and dependable project coordination.",
      services: ["Initial project consultation", "Design planning", "Site coordination"],
    },
    theme: theme("#36393a", "#b3845e", "#f8f6f3", "#ffffff", "#292a29"),
  },
  {
    key: "consultant",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-professional-consultant-v1.webp",
    match: [
      "consultant", "consulting", "business consulting", "management consulting", "unternehmensberatung",
      "managementberatung", "strategieberatung", "conseil strategique", "consultorÃ­a", "consulenza aziendale",
    ],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-consultant-strategy-v1.webp",
        "/images/templates/wl-consultant-analysis-v1.webp",
        "/images/templates/wl-consultant-alignment-v1.webp",
      ],
    },
    starterContent: {
      description:
        "Focused business advice that turns complex questions into clear priorities and practical next steps.",
      services: ["Strategy workshop", "Business analysis", "Team alignment"],
    },
    theme: theme("#233844", "#6eabb8", "#f4f9fa", "#ffffff", "#1e3038"),
  },
  {
    key: "consultation",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-professional-consultation-v1.png",
    match: [
      "professional services", "professional service", "business advisory",
      "consultation", "beratung", "conseil", "consulta", "consulenza",
      "keshillim profesional", "këshillim profesional", "keshillim", "kÃ«shillim",
    ],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-consultation-one-to-one-v1.webp",
        "/images/templates/wl-consultation-solution-planning-v1.webp",
        "/images/templates/wl-consultation-remote-v1.webp",
      ],
    },
    starterContent: {
      description:
        "Clear, personal advice for decisions that benefit from a structured conversation and practical next steps.",
      services: ["Initial consultation", "Solution planning", "Ongoing guidance"],
    },
    theme: theme("#273644", "#b98259", "#f9f7f4", "#ffffff", "#273039"),
  },

  {
    key: "veterinary",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-pet-veterinary-v1.webp",
    match: ["veterinary", "veterinarian", "vet", "veterinar", "tierarzt", "veterinaire", "vÃ©tÃ©rinaire", "veterinario"],
    starterMedia: { serviceImageUrls: ["/images/templates/wl-veterinary-consultation-v1.webp", "/images/templates/wl-veterinary-diagnostics-v1.webp", "/images/templates/wl-veterinary-prevention-v1.webp"] },
    starterContent: { description: "Compassionate veterinary care for everyday health, careful assessment and confident pet owners.", services: ["Veterinary consultation", "Gentle assessment", "Preventive care guidance"] },
    theme: theme("#24454c", "#75b7a4", "#f4fbf8", "#ffffff", "#1f3539"),
  },
  {
    key: "pet-grooming",
    layout: "studio",
    heroImageUrl: "/images/templates/wl-pet-grooming-v1.webp",
    match: ["pet grooming", "dog grooming", "groomer", "grooming", "hundesalon", "tierpflege", "toilettage", "toelettatura"],
    preferredTheme: "gold",
    starterMedia: { serviceImageUrls: ["/images/templates/wl-pet-grooming-bath-v1.webp", "/images/templates/wl-pet-grooming-coat-v1.webp", "/images/templates/wl-pet-grooming-finish-v1.webp"] },
    starterContent: { description: "Gentle grooming, careful coat care and a calm finish for pets who deserve patient attention.", services: ["Gentle bath and care", "Coat grooming", "Calm finishing service"] },
    theme: theme("#674b36", "#d39b6a", "#fff8f1", "#ffffff", "#38291e"),
  },
  {
    key: "dog-training",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-pet-dog-training-v1.webp",
    match: ["dog training", "dog trainer", "hundeschule", "hundetraining", "education canine", "adiestramiento canino", "addestramento cani"],
    starterMedia: { serviceImageUrls: ["/images/templates/wl-dog-training-assessment-v1.webp", "/images/templates/wl-dog-training-obedience-v1.webp", "/images/templates/wl-dog-training-owner-v1.webp"] },
    starterContent: { description: "Patient, practical dog training that helps owners build calm routines and clear communication.", services: ["Training assessment", "Everyday obedience", "Owner guidance"] },
    theme: theme("#34452c", "#a6b55d", "#f5f8ed", "#ffffff", "#273321"),
  },
  {
    key: "pet-wellness",
    layout: "studio",
    heroImageUrl: "/images/templates/wl-pet-wellness-v1.webp",
    match: ["pet wellness", "tierwellness", "animal wellbeing", "animal well-being", "bien-etre animal", "bien-Ãªtre animal"],
    starterMedia: { serviceImageUrls: ["/images/templates/wl-pet-wellness-comfort-v1.webp", "/images/templates/wl-pet-wellness-mobility-v1.webp", "/images/templates/wl-pet-wellness-rest-v1.webp"] },
    starterContent: { description: "A calm wellbeing space supporting comfortable routines, gentle movement and relaxed time together.", services: ["Comfort-focused care", "Gentle movement support", "Relaxed wellbeing time"] },
    theme: theme("#4d435b", "#b399d3", "#f8f6fb", "#ffffff", "#342d3e"),
  },

  {
    key: "window-cleaning",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-cleaning-window-v1.webp",
    match: ["window cleaning", "fensterreinigung"],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-cleaning-home-detail-v1.webp",
        "/images/templates/wl-cleaning-workspace-detail-v1.webp",
        "/images/templates/wl-cleaning-glass-detail-v1.webp",
      ],
    },
    theme: theme("#1d5065", "#63bbd2", "#f4fbfd", "#ffffff", "#193944"),
  },
  {
    key: "office-cleaning",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-cleaning-office-v1.webp",
    match: ["office cleaning", "buroreinigung"],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-cleaning-home-detail-v1.webp",
        "/images/templates/wl-cleaning-workspace-detail-v1.webp",
        "/images/templates/wl-cleaning-glass-detail-v1.webp",
      ],
    },
    theme: theme("#234b55", "#5fb8bd", "#f3faf9", "#ffffff", "#1d3439"),
  },
  {
    key: "facility-cleaning",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-cleaning-facility-v1.webp",
    match: ["facility", "gebaudeservice", "building service"],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-cleaning-home-detail-v1.webp",
        "/images/templates/wl-cleaning-workspace-detail-v1.webp",
        "/images/templates/wl-cleaning-glass-detail-v1.webp",
      ],
    },
    theme: theme("#263d42", "#77a8a5", "#f5f8f7", "#ffffff", "#243234"),
  },
  {
    key: "home-cleaning",
    layout: "clarity",
    heroImageUrl: "/images/templates/wl-cleaning-home-v1.webp",
    match: ["cleaning", "reinigung", "cleaner"],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-cleaning-home-detail-v1.webp",
        "/images/templates/wl-cleaning-workspace-detail-v1.webp",
        "/images/templates/wl-cleaning-glass-detail-v1.webp",
      ],
    },
    theme: theme("#285164", "#6cbdd0", "#f4fbfd", "#ffffff", "#203b47"),
  },

  {
    key: "electrician",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-trade-electrician-v1.webp",
    match: ["electrician", "elektriker", "electric"],
    starterMedia: { serviceImageUrls: ["/images/templates/wl-electrician-inspection-v1.webp", "/images/templates/wl-electrician-installation-v1.webp", "/images/templates/wl-electrician-lighting-v1.webp"] },
    starterContent: { description: "Careful electrical work, clear advice and dependable installation for homes and businesses.", services: ["Electrical inspection", "Installation work", "Lighting and maintenance"] },
    theme: theme("#24272a", "#f2b84b", "#f9f7f1", "#ffffff", "#252526"),
  },
  {
    key: "plumbing-heating",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-trade-plumbing-heating-v1.webp",
    match: ["plumbing", "heating", "sanitar", "heizung"],
    starterMedia: { serviceImageUrls: ["/images/templates/wl-plumbing-heating-inspection-v1.webp", "/images/templates/wl-plumbing-heating-installation-v1.webp", "/images/templates/wl-plumbing-heating-maintenance-v1.webp"] },
    starterContent: { description: "Reliable plumbing and heating work with careful installation, practical maintenance and clear communication.", services: ["Heating system inspection", "Plumbing installation", "Routine maintenance"] },
    theme: theme("#263d49", "#de7a48", "#f7f7f5", "#ffffff", "#213039"),
  },
  {
    key: "locksmith",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-trade-locksmith-v1.webp",
    match: ["locksmith", "schlossel", "key service"],
    starterMedia: { serviceImageUrls: ["/images/templates/wl-locksmith-security-v1.webp", "/images/templates/wl-locksmith-key-service-v1.webp", "/images/templates/wl-locksmith-door-adjustment-v1.webp"] },
    starterContent: { description: "Practical lock, key and door-hardware support with careful workmanship and clear advice.", services: ["Lock and cylinder service", "Key service", "Door hardware adjustment"] },
    theme: theme("#2d2c27", "#d9a448", "#f8f6f0", "#ffffff", "#292820"),
  },
  {
    key: "handyman",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-trade-handyman-v1.webp",
    match: ["handyman", "hausmeister", "repair"],
    starterMedia: { serviceImageUrls: ["/images/templates/wl-handyman-home-repair-v1.webp", "/images/templates/wl-handyman-furniture-v1.webp", "/images/templates/wl-handyman-maintenance-v1.webp"] },
    starterContent: { description: "Dependable help for everyday home and property tasks, completed with care and attention to detail.", services: ["Home repairs", "Furniture assembly", "Everyday maintenance"] },
    theme: theme("#40382e", "#cf8850", "#faf7f0", "#ffffff", "#30291f"),
  },

  {
    key: "courier",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-delivery-courier-v1.webp",
    match: ["courier", "kurier"],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-logistics-pickup-v1.webp",
        "/images/templates/wl-logistics-route-v1.webp",
        "/images/templates/wl-logistics-handover-v1.webp",
      ],
    },
    theme: theme("#25303a", "#e18b42", "#f7f8fa", "#ffffff", "#252c32"),
  },
  {
    key: "moving",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-delivery-moving-v1.webp",
    match: ["moving", "umzug", "removal"],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-moving-planning-v1.webp",
        "/images/templates/wl-moving-packing-v1.webp",
        "/images/templates/wl-moving-transport-v1.webp",
      ],
    },
    theme: theme("#3d3029", "#dc8050", "#faf6f2", "#ffffff", "#30251f"),
  },
  {
    key: "local-delivery",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-delivery-local-v1.webp",
    match: ["delivery", "liefer", "transport"],
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-logistics-pickup-v1.webp",
        "/images/templates/wl-logistics-route-v1.webp",
        "/images/templates/wl-logistics-handover-v1.webp",
      ],
    },
    theme: theme("#243f3d", "#72b79a", "#f4faf7", "#ffffff", "#203431"),
  },

  {
    key: "tree-service",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-garden-tree-service-v1.webp",
    match: ["tree", "baum", "arbor", "baumpflege"],
    starterMedia: { serviceImageUrls: ["/images/templates/wl-tree-inspection-v1.webp", "/images/templates/wl-tree-pruning-v1.webp", "/images/templates/wl-tree-clearance-v1.webp"] },
    starterContent: { description: "Professional tree care with careful assessment, safe pruning and tidy site clearance.", services: ["Tree assessment", "Safe pruning", "Branch clearance"] },
    theme: theme("#273c2c", "#91b95d", "#f5f8ed", "#ffffff", "#223124"),
  },
  {
    key: "landscaping",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-garden-landscaping-v1.webp",
    match: ["landscap", "gartenbau", "garden design"],
    starterMedia: { serviceImageUrls: ["/images/templates/wl-garden-design-v1.webp", "/images/templates/wl-garden-planting-v1.webp", "/images/templates/wl-garden-care-v1.webp"] },
    starterContent: { description: "Thoughtful garden design and practical planting work for outdoor spaces that grow beautifully.", services: ["Garden design consultation", "Planting and landscaping", "Seasonal garden care"] },
    theme: theme("#3c5130", "#a6bf64", "#f6f9ed", "#ffffff", "#29381f"),
  },
  {
    key: "garden-maintenance",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-garden-maintenance-v1.webp",
    starterMedia: { serviceImageUrls: ["/images/templates/wl-garden-design-v1.webp", "/images/templates/wl-garden-planting-v1.webp", "/images/templates/wl-garden-care-v1.webp"] },
    starterContent: { description: "Reliable garden maintenance for healthy planting, tidy borders and outdoor spaces that stay cared for.", services: ["Garden care plan", "Planting maintenance", "Seasonal pruning"] },
    match: ["garden", "gÃ¤rtner", "gartner"],
    theme: theme("#345335", "#9fbd64", "#f4f9f0", "#ffffff", "#253b26"),
  },
  {
    key: "irrigation",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-garden-irrigation-v1.webp",
    match: ["irrigation", "bewasser", "watering"],
    starterMedia: { serviceImageUrls: ["/images/templates/wl-irrigation-plan-v1.webp", "/images/templates/wl-irrigation-install-v1.webp", "/images/templates/wl-irrigation-test-v1.webp"] },
    starterContent: { description: "Practical irrigation planning and installation for gardens that receive water where it is needed.", services: ["Irrigation planning", "System installation", "Seasonal system check"] },
    theme: theme("#245363", "#64b5c5", "#f2fafb", "#ffffff", "#1e3c45"),
  },

  {
    key: "crane-service",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-construction-crane-v1.png",
    match: ["crane", "kran"],
    theme: theme("#2e3030", "#e49b45", "#f7f4ed", "#ffffff", "#272928"),
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-crane-lift-plan-v1.png",
        "/images/templates/wl-crane-coordination-v1.png",
        "/images/templates/wl-crane-site-support-v1.png",
      ],
    },
    starterContent: {
      description: "Planned lifting operations with clear coordination and careful site support.",
      services: ["Lift planning", "Coordinated lifting", "Site support"],
    },
  },
  {
    key: "civil-engineering",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-construction-deep-v1.png",
    match: ["civil engineering", "tiefbau", "infrastructure"],
    theme: theme("#30363b", "#d8954e", "#f5f6f5", "#ffffff", "#283036"),
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-civil-survey-v1.png",
        "/images/templates/wl-civil-groundworks-v1.png",
        "/images/templates/wl-civil-infrastructure-v1.png",
      ],
    },
    starterContent: {
      description: "Structured civil engineering support from site surveying through infrastructure preparation.",
      services: ["Site surveying", "Groundworks coordination", "Infrastructure preparation"],
    },
  },
  {
    key: "fiber-network",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-construction-fiber-v1.png",
    match: ["fibre", "fiber", "glasfaser", "network"],
    theme: theme("#253645", "#4ea5c7", "#f4f8fb", "#ffffff", "#1f2d38"),
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-fiber-planning-v1.png",
        "/images/templates/wl-fiber-installation-v1.png",
        "/images/templates/wl-fiber-testing-v1.png",
      ],
    },
    starterContent: {
      description: "Careful fibre-network work covering planning, installation and connection checks.",
      services: ["Network planning", "Conduit installation", "Connection testing"],
    },
  },
  {
    key: "glass-facade",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-construction-glass-v1.png",
    match: ["glass", "glazing", "fassade"],
    theme: theme("#283f4b", "#66b9cb", "#f3f8fa", "#ffffff", "#20333b"),
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-glass-assessment-v1.png",
        "/images/templates/wl-glass-installation-v1.png",
        "/images/templates/wl-glass-finish-v1.png",
      ],
    },
    starterContent: {
      description: "Precise glass and facade work with careful assessment, installation and finishing.",
      services: ["Facade assessment", "Glazing installation", "Finishing and maintenance"],
    },
  },
  {
    key: "house-construction",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-construction-house-v1.png",
    match: ["house construction", "hausbau", "builder", "renovation"],
    theme: theme("#3e3429", "#d18a52", "#f9f5ef", "#ffffff", "#30271f"),
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-construction-planning-v1.png",
        "/images/templates/wl-construction-structure-v1.png",
        "/images/templates/wl-construction-finish-v1.png",
      ],
    },
    starterContent: {
      description: "Careful house construction support from planning through build coordination and finishing.",
      services: ["Project planning", "Structural coordination", "Build progress support"],
    },
  },
  {
    key: "construction",
    layout: "forge",
    heroImageUrl: "/images/templates/wl-construction-plans-v1.png",
    match: ["construction", "bau", "contractor"],
    theme: theme("#343535", "#c79050", "#f7f6f2", "#ffffff", "#292a29"),
    starterMedia: {
      serviceImageUrls: [
        "/images/templates/wl-construction-planning-v1.png",
        "/images/templates/wl-construction-structure-v1.png",
        "/images/templates/wl-construction-finish-v1.png",
      ],
    },
    starterContent: {
      description: "Practical construction support with clear planning, site coordination and quality-focused delivery.",
      services: ["Project consultation", "Site coordination", "Building works"],
    },
  },
];

const fallbackTemplate: BusinessTemplate = {
  key: "midnight",
  layout: "clarity",
  heroImageUrl: "/images/templates/midnight-hero-v1.png",
  match: [],
  theme: theme("#1e2733", "#83a9c9", "#f5f8fb", "#ffffff", "#1d2935"),
};

export function getBusinessTemplate(key?: string) {
  return businessTemplates.find((template) => template.key === key);
}

export const designPresets: ReadonlyArray<{
  key: ThemeSelection;
  name: string;
  detail: string;
}> = [
  { key: "auto", name: "Recommended", detail: "Matched automatically to the business category" },
  { key: "studio", name: "Studio", detail: "Warm, editorial and personal" },
  { key: "clarity", name: "Clarity", detail: "Clean, calm and contemporary" },
  { key: "forge", name: "Forge", detail: "Strong, practical and confident" },
  { key: "gold", name: "Gold Luxury", detail: "Dark, premium and exclusive" },
];

export function resolveSiteDesign(
  templateKey: string,
  requestedTheme: ThemeSelection = "auto",
): { themeKey: ThemeSelection; template: SiteTemplate; theme: SiteDocument["theme"] } {
  const template = getBusinessTemplate(templateKey) ?? fallbackTemplate;
  const themeKey: ThemeSelection =
    requestedTheme === "auto"
      ? template.preferredTheme ?? "auto"
      : requestedTheme;
  return {
    themeKey,
    template: themeKey === "auto" || themeKey === "gold" ? template.layout : themeKey,
    theme:
      themeKey === "gold"
        ? theme("#11100e", "#c9a45d", "#15130f", "#211d15", "#f5efe2")
        : template.theme,
  };
}

export const templateCategories = [
  {
    key: "vehicle",
    label: "Vehicle services & sales",
    templates: ["auto-repair", "car-dealership"],
  },
  {
    key: "food",
    label: "Restaurants & food",
    templates: ["restaurant", "fast-food"],
  },
  {
    key: "beauty",
    label: "Beauty & hair",
    templates: [
      "barber",
      "hair-salon",
      "nail-studio",
      "lashes-brows",
      "beauty-studio",
    ],
  },
  {
    key: "health-care",
    label: "Health & care",
    templates: ["medical-practice", "dental-practice", "home-care", "psychotherapy"],
  },
  {
    key: "wellness",
    label: "Wellness & therapy",
    templates: [
      "physiotherapy",
      "osteopathy",
      "massage",
      "nutrition",
      "wellness",
    ],
  },
  {
    key: "professional",
    label: "Professional services",
    templates: [
      "lawyer",
      "accountant",
      "insurance",
      "architect",
      "consultant",
      "consultation",
    ],
  },
  {
    key: "pet",
    label: "Pet services",
    templates: ["veterinary", "pet-grooming", "dog-training", "pet-wellness"],
  },
  {
    key: "cleaning",
    label: "Cleaning",
    templates: [
      "window-cleaning",
      "office-cleaning",
      "facility-cleaning",
      "home-cleaning",
    ],
  },
  {
    key: "trade",
    label: "Trades",
    templates: ["electrician", "plumbing-heating", "locksmith", "handyman"],
  },
  {
    key: "delivery",
    label: "Delivery & transport",
    templates: ["courier", "moving", "local-delivery"],
  },
  {
    key: "garden",
    label: "Garden & outdoor",
    templates: [
      "tree-service",
      "landscaping",
      "garden-maintenance",
      "irrigation",
    ],
  },
  {
    key: "construction",
    label: "Construction",
    templates: [
      "crane-service",
      "civil-engineering",
      "fiber-network",
      "glass-facade",
      "house-construction",
      "construction",
    ],
  },
] as const;

const demoAssetGroups = {
  vehicle: [
    "/images/templates/wl-auto-repair-hero-v1.webp",
    "/images/templates/wl-car-dealership-hero-v1.webp",
  ],
  beauty: [
    "/images/templates/wl-beauty-barber-v1.webp",
    "/images/templates/wl-beauty-hair-salon-v1.webp",
    "/images/templates/wl-beauty-nails-v1.webp",
    "/images/templates/wl-beauty-lashes-brows-v1.webp",
    "/images/templates/wl-beauty-studio-v1.webp",
  ],
  wellness: [
    "/images/templates/wl-wellness-massage-v1.webp",
    "/images/templates/wl-wellness-physiotherapy-v1.webp",
    "/images/templates/wl-wellness-osteopathy-v1.webp",
    "/images/templates/wl-wellness-nutrition-v1.webp",
    "/images/templates/wl-wellness-studio-v1.webp",
  ],
  "health-care": [
    "/images/templates/wl-health-medical-practice-hero-v1.png",
    "/images/templates/wl-health-dental-practice-hero-v1.png",
    "/images/templates/wl-health-home-care-hero-v1.png",
    "/images/templates/wl-health-therapy-practice-hero-v1.png",
  ],
  professional: [
    "/images/templates/wl-professional-lawyer-v1.webp",
    "/images/templates/wl-professional-accountant-v1.webp",
    "/images/templates/wl-professional-insurance-v1.webp",
    "/images/templates/wl-professional-architect-v1.webp",
    "/images/templates/wl-professional-consultant-v1.webp",
  ],
  pet: [
    "/images/templates/wl-pet-veterinary-v1.webp",
    "/images/templates/wl-pet-grooming-v1.webp",
    "/images/templates/wl-pet-dog-training-v1.webp",
    "/images/templates/wl-pet-wellness-v1.webp",
  ],
  cleaning: [
    "/images/templates/wl-cleaning-home-v1.webp",
    "/images/templates/wl-cleaning-office-v1.webp",
    "/images/templates/wl-cleaning-window-v1.webp",
    "/images/templates/wl-cleaning-facility-v1.webp",
  ],
  trade: [
    "/images/templates/wl-trade-electrician-v1.webp",
    "/images/templates/wl-trade-plumbing-heating-v1.webp",
    "/images/templates/wl-trade-locksmith-v1.webp",
    "/images/templates/wl-trade-handyman-v1.webp",
  ],
  delivery: [
    "/images/templates/wl-delivery-local-v1.webp",
    "/images/templates/wl-delivery-courier-v1.webp",
    "/images/templates/wl-delivery-moving-v1.webp",
  ],
  garden: [
    "/images/templates/wl-garden-tree-service-v1.webp",
    "/images/templates/wl-garden-landscaping-v1.webp",
    "/images/templates/wl-garden-maintenance-v1.webp",
    "/images/templates/wl-garden-irrigation-v1.webp",
  ],
  construction: [
    "/images/templates/wl-construction-crane-v1.png",
    "/images/templates/wl-construction-deep-v1.png",
    "/images/templates/wl-construction-fiber-v1.png",
    "/images/templates/wl-construction-glass-v1.png",
    "/images/templates/wl-construction-house-v1.png",
    "/images/templates/wl-construction-plans-v1.png",
  ],
} as const;

export function demoMediaFor(template: BusinessTemplate) {
  if (template.starterMedia) {
    return {
      serviceImageUrls: [...template.starterMedia.serviceImageUrls] as [string, string, string],
      galleryImageUrls: [
        ...(template.starterMedia.galleryImageUrls ?? template.starterMedia.serviceImageUrls),
      ],
    };
  }
  const group =
    Object.values(demoAssetGroups).find((assets) =>
      assets.includes(template.heroImageUrl as never),
    ) ?? demoAssetGroups.professional;
  const distinct = group.filter((asset) => asset !== template.heroImageUrl);
  const selected = distinct.slice(0, 3);
  return {
    serviceImageUrls: [
      selected[0] ?? "",
      selected[1] ?? "",
      selected[2] ?? "",
    ] as [string, string, string],
    galleryImageUrls: selected,
  };
}

const categoryStarterContent = {
  vehicle: {
    description:
      "Professional vehicle service, clear advice and dependable support for every journey.",
    services: ["Personal consultation", "Vehicle service", "Reliable follow-up"],
  },
  food: {
    description:
      "Freshly prepared food, welcoming service and a dining experience worth returning for.",
    services: ["Signature menu", "Eat in and takeaway", "Private occasions"],
  },
  beauty: {
    description:
      "Personal care, considered technique and a look designed around you.",
    services: [
      "Personal consultation",
      "Signature service",
      "Care and finishing",
    ],
  },
  wellness: {
    description:
      "Thoughtful support for movement, balance and everyday wellbeing.",
    services: ["Initial consultation", "Individual treatment", "Ongoing care"],
  },
  "health-care": {
    description:
      "Professional, respectful support with clear information and attention to each person’s individual situation.",
    services: ["Personal consultation", "Careful assessment", "Clear follow-up guidance"],
  },
  professional: {
    description:
      "Clear advice, dependable expertise and personal support for every next step.",
    services: ["Initial consultation", "Tailored solution", "Ongoing support"],
  },
  pet: {
    description:
      "Professional, caring service focused on the wellbeing of every animal.",
    services: [
      "Personal assessment",
      "Professional care",
      "Advice and follow-up",
    ],
  },
  cleaning: {
    description:
      "Reliable cleaning with careful standards, clear communication and consistent results.",
    services: ["Regular cleaning", "Deep cleaning", "Tailored service plan"],
  },
  trade: {
    description:
      "Reliable workmanship, clear communication and practical solutions built to last.",
    services: [
      "Inspection and advice",
      "Installation and repair",
      "Maintenance service",
    ],
  },
  delivery: {
    description:
      "Dependable transport, careful handling and straightforward coordination from start to finish.",
    services: ["Local delivery", "Scheduled transport", "Tailored logistics"],
  },
  garden: {
    description:
      "Professional outdoor care shaped around healthy growth, safety and lasting results.",
    services: [
      "Site consultation",
      "Garden and landscape care",
      "Seasonal maintenance",
    ],
  },
  construction: {
    description:
      "Precise planning, dependable delivery and skilled work for demanding projects.",
    services: [
      "Project consultation",
      "Construction and installation",
      "Maintenance and support",
    ],
  },
} as const;

export function demoContentFor(template: BusinessTemplate) {
  if (template.starterContent) return template.starterContent;
  const category = templateCategories.find((item) =>
    item.templates.includes(template.key as never),
  )?.key;
  return categoryStarterContent[category ?? "professional"];
}

function normalizeTemplateMatchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase();
}

function templateMatchSpecificity(haystack: string, term: string) {
  const normalizedTerm = normalizeTemplateMatchText(term);
  if (!normalizedTerm) return 0;

  let best = 0;
  let index = haystack.indexOf(normalizedTerm);
  while (index >= 0) {
    const startsAtWordBoundary =
      index === 0 || !/[\p{L}\p{N}]$/u.test(haystack.slice(0, index));
    if (startsAtWordBoundary) {
      best = Math.max(best, normalizedTerm.length);
    }
    index = haystack.indexOf(normalizedTerm, index + 1);
  }
  return best;
}

export function selectBusinessTemplate(...values: Array<string | undefined>) {
  for (const value of values) {
    const haystack = value ? normalizeTemplateMatchText(value) : "";
    if (!haystack) continue;
    // A narrow phrase (for example `tierwellness`) must win over an earlier,
    // broad phrase (`wellness`). Catalog order remains the stable tie-breaker.
    const matched = businessTemplates
      .map((template, index) => ({
        template,
        index,
        specificity: Math.max(
          0,
          ...template.match.map((term) => templateMatchSpecificity(haystack, term)),
        ),
      }))
      .filter((candidate) => candidate.specificity > 0)
      .sort((left, right) => right.specificity - left.specificity || left.index - right.index)[0]?.template;
    if (matched) return matched;
  }
  return fallbackTemplate;
}
