/* Automatic website design planner (BSRC-DESIGN-P5-001).
 *
 * The automatic creation path (homepage wizard / owner complimentary without
 * an existing-website import) previously derived ONLY the archetype from a
 * small template map and took every other composition value from the
 * archetype contract defaults — and the palette straight from the template
 * catalog. Restaurant and hair-salon templates carry near-identical dark
 * palettes (bg #15130f / #15130f) and both map to local-service-conversion
 * with a centered compact hero, so different businesses came out visually
 * interchangeable and low-prominence (audited 2026-10-03).
 *
 * This module is the category-driven planner for that path: per-family
 * visual profiles (archetype, hero prominence policy, palette family,
 * typography, icon style, CTA intent, density, mood) with deterministic
 * seeded variation inside each profile, a cross-category design
 * fingerprint, and a mandatory WCAG contrast guard that repairs generated
 * palettes before anything reaches the renderer.
 *
 * Framework-free: pure data + pure functions, no product names, no React. */

import type { SiteDocument } from "./contracts";
import type { ColorDirection, HeroVariantId, LayoutArchetypeId, SiteCtaStrategy, SiteDesignSectionVariants, SiteImageStrategy, SiteSectionId, SiteThemeId, TypographyDirection } from "./contracts";
import { archetypeContracts, siteThemeIds, type SiteDesignInput } from "./design-system";

export type HeroProminence = "immersive" | "full-width" | "split-large" | "editorial" | "compact";
export type IconStyle = "line" | "solid";
export type ThemeFamily =
  | "warm-atmospheric" | "fashion-editorial" | "heritage" | "immersive-hospitality"
  | "energetic" | "editorial-restrained" | "industrial-steel" | "gallery-minimal"
  | "clean-light" | "clinical-fresh" | "technical-modern" | "trust-classic" | "neutral-slate";

/** Palette = SiteDocument["theme"] token order: primary, accent, background, surface, text. */
export type AutomaticPalette = [string, string, string, string, string];

export type AutomaticDesignInput = {
  categoryKey: string;
  subcategoryKey?: string | null;
  businessName: string;
  locale: string;
  services: string[];
  /** What the primary action should achieve; derived from the category when absent. */
  ctaIntent?: "book" | "call" | "quote" | "visit" | "order";
  /** Whether (and how) generated/starter imagery will be present. */
  generatedImageStrategy?: "rich" | "moderate" | "minimal";
  /** Free-form brand mood hint for the future; the planner treats it as a soft signal. */
  brandMood?: string | null;
};

export type AutomaticDesignPlan = {
  archetype: LayoutArchetypeId;
  heroVariant: HeroVariantId;
  heroProminence: HeroProminence;
  sectionOrder: SiteSectionId[];
  sectionVariants: SiteDesignSectionVariants;
  themeFamily: ThemeFamily;
  themeId: SiteThemeId;
  palette: AutomaticPalette;
  typographyDirection: TypographyDirection;
  colorDirection: ColorDirection;
  iconStyle: IconStyle;
  imageStrategy: SiteImageStrategy;
  ctaStrategy: SiteCtaStrategy;
  density: "compact" | "regular" | "spacious";
  visualMood: string;
  /** Cross-category diversity fingerprint (see designFingerprintOf). */
  designFingerprint: string;
};

/* ── palettes ──────────────────────────────────────────────────────────── */

/** Palette token order: primary, accent, background, surface, text.
 * Every family carries materially different directions; variants inside a
 * family give same-category sites a light/dark choice instead of one look. */
const FAMILY_PALETTES: Record<ThemeFamily, AutomaticPalette[]> = {
  "warm-atmospheric": [
    ["#31150f", "#c96f3b", "#fbf5ee", "#ffffff", "#2b1a12"],
    ["#1c0f0a", "#d98e4a", "#221410", "#2c1a14", "#f7ead9"],
  ],
  "fashion-editorial": [
    ["#241c22", "#b76e79", "#fdf9f7", "#ffffff", "#241c22"],
    ["#201825", "#c9899a", "#241b28", "#2e2433", "#f6eef2"],
  ],
  heritage: [
    ["#1d2321", "#b08d4f", "#f4f1ea", "#ffffff", "#1d2321"],
    ["#23201a", "#c9a45d", "#26221a", "#312c22", "#f3ecdc"],
  ],
  "immersive-hospitality": [
    ["#12263a", "#c9a45d", "#f7f6f2", "#ffffff", "#16222e"],
    ["#0f1f30", "#d3b878", "#14202e", "#1c2a3a", "#f2f0e9"],
  ],
  energetic: [
    ["#101418", "#d4e94a", "#0f1215", "#181d22", "#f4f6f2"],
    ["#14181c", "#ff6a3d", "#f5f6f7", "#ffffff", "#14181c"],
  ],
  "editorial-restrained": [
    ["#1f2e43", "#8a6d3b", "#faf9f6", "#ffffff", "#212a35"],
    ["#243b53", "#97795c", "#f8f7f3", "#ffffff", "#1f2933"],
  ],
  "industrial-steel": [
    ["#23272b", "#e0a428", "#f5f6f7", "#ffffff", "#22262a"],
    ["#1d2124", "#f0b429", "#22262a", "#2c3136", "#f2f4f5"],
  ],
  "gallery-minimal": [
    ["#17181a", "#b08d57", "#ffffff", "#f6f6f6", "#17181a"],
    ["#141414", "#c96f4a", "#131313", "#1c1c1c", "#f4f2ef"],
  ],
  "clean-light": [
    ["#23282d", "#7a5c3e", "#ffffff", "#f7f7f5", "#23282d"],
    ["#2c2a26", "#a0622d", "#faf8f4", "#ffffff", "#2c2a26"],
  ],
  "clinical-fresh": [
    ["#143c36", "#2f8f7a", "#f6faf9", "#ffffff", "#182b28"],
    ["#0f2f2b", "#43a38d", "#11302c", "#1a403a", "#eef7f4"],
  ],
  "technical-modern": [
    ["#101828", "#4f6df5", "#f7f8fa", "#ffffff", "#101828"],
    ["#0d1420", "#6c87ff", "#101828", "#182234", "#eef1f7"],
  ],
  "trust-classic": [
    ["#1d3a2f", "#8a6d3b", "#f8f8f5", "#ffffff", "#1e2b25"],
    ["#16302c", "#b99a5b", "#f6f7f4", "#ffffff", "#1c2a26"],
  ],
  "neutral-slate": [
    ["#26282c", "#8a6d3b", "#f7f7f8", "#ffffff", "#26282c"],
    ["#212327", "#a3742f", "#1f2124", "#2a2d31", "#f2f2f3"],
  ],
};

/* ── family profiles ───────────────────────────────────────────────────── */

type FamilyProfile = {
  /** Ranked archetype candidates; the seed picks among the top ones. */
  archetypes: LayoutArchetypeId[];
  /** Ranked hero variants for the chosen archetype (policy-filtered). */
  heroes: { variant: HeroVariantId; prominence: HeroProminence }[];
  themeFamily: ThemeFamily;
  /** Light palette first, dark second; the seed decides. */
  paletteVariant?: 0 | 1;
  typography: TypographyDirection[];
  colorDirection: ColorDirection[];
  iconStyle: IconStyle;
  imageStrategy: SiteImageStrategy;
  cta: { intent: AutomaticDesignInput["ctaIntent"]; strategy: SiteCtaStrategy };
  density: "compact" | "regular" | "spacious";
  visualMood: string;
  /** Preferred leading sections (filtered against the archetype's renderable set). */
  orderLead: SiteSectionId[];
};

const VISUAL_HEROES: FamilyProfile["heroes"] = [
  { variant: "fullscreen", prominence: "immersive" },
  { variant: "split", prominence: "split-large" },
  { variant: "editorial", prominence: "full-width" },
];
const PROFESSIONAL_HEROES: FamilyProfile["heroes"] = [
  { variant: "editorial", prominence: "editorial" },
  { variant: "split", prominence: "split-large" },
];

const FAMILY_PROFILES: Record<string, FamilyProfile> = {
  "food-restaurant": {
    archetypes: ["local-service-conversion", "editorial-premium"],
    heroes: [
      { variant: "fullscreen", prominence: "immersive" },
      { variant: "split", prominence: "split-large" },
    ],
    themeFamily: "warm-atmospheric",
    typography: ["serif-led"],
    colorDirection: ["dark", "split"],
    iconStyle: "line",
    imageStrategy: "hero-led",
    cta: { intent: "book", strategy: "visit-first" },
    density: "regular",
    visualMood: "atmospheric, culinary, warm elegance",
    orderLead: ["hero", "trust", "services", "gallery", "about", "contact"],
  },
  "beauty-wellness": {
    archetypes: ["local-service-conversion", "editorial-premium"],
    heroes: [
      { variant: "split", prominence: "split-large" },
      { variant: "fullscreen", prominence: "immersive" },
    ],
    themeFamily: "fashion-editorial",
    typography: ["sans-led"],
    colorDirection: ["light", "dark"],
    iconStyle: "solid",
    imageStrategy: "hero-led",
    cta: { intent: "book", strategy: "call-first" },
    density: "regular",
    visualMood: "fashion-forward, polished, confident",
    orderLead: ["hero", "services", "gallery", "about", "trust", "contact"],
  },
  hospitality: {
    archetypes: ["editorial-premium", "local-service-conversion"],
    heroes: VISUAL_HEROES,
    themeFamily: "immersive-hospitality",
    typography: ["serif-led"],
    colorDirection: ["dark", "split"],
    iconStyle: "line",
    imageStrategy: "hero-led",
    cta: { intent: "book", strategy: "visit-first" },
    density: "spacious",
    visualMood: "immersive, hospitable, calm luxury",
    orderLead: ["hero", "gallery", "services", "about", "trust", "contact"],
  },
  "construction-trades": {
    archetypes: ["industrial-bold", "local-service-conversion"],
    heroes: [
      { variant: "industrial", prominence: "full-width" },
      { variant: "split", prominence: "split-large" },
    ],
    themeFamily: "industrial-steel",
    typography: ["sans-led"],
    colorDirection: ["light", "dark"],
    iconStyle: "solid",
    imageStrategy: "project-led",
    cta: { intent: "quote", strategy: "quote-first" },
    density: "regular",
    visualMood: "strong geometry, capability-first, dependable",
    orderLead: ["hero", "services", "projects", "trust", "about", "contact"],
  },
  "manufacturing-industrial": {
    archetypes: ["industrial-bold"],
    heroes: [
      { variant: "industrial", prominence: "full-width" },
      { variant: "split", prominence: "split-large" },
    ],
    themeFamily: "industrial-steel",
    typography: ["sans-led"],
    colorDirection: ["dark", "light"],
    iconStyle: "solid",
    imageStrategy: "project-led",
    cta: { intent: "quote", strategy: "quote-first" },
    density: "regular",
    visualMood: "precision, capacity, engineering confidence",
    orderLead: ["hero", "services", "projects", "about", "trust", "contact"],
  },
  "legal-professional": {
    archetypes: ["editorial-premium"],
    heroes: PROFESSIONAL_HEROES,
    themeFamily: "editorial-restrained",
    typography: ["serif-led"],
    colorDirection: ["light"],
    iconStyle: "line",
    imageStrategy: "minimal",
    cta: { intent: "visit", strategy: "form-first" },
    density: "spacious",
    visualMood: "typography-led, restrained, trustworthy",
    orderLead: ["hero", "about", "services", "trust", "contact"],
  },
  healthcare: {
    archetypes: ["editorial-premium", "local-service-conversion"],
    heroes: PROFESSIONAL_HEROES,
    themeFamily: "clinical-fresh",
    typography: ["sans-led"],
    colorDirection: ["light"],
    iconStyle: "line",
    imageStrategy: "balanced",
    cta: { intent: "book", strategy: "call-first" },
    density: "regular",
    visualMood: "clean, reassuring, well-organised",
    orderLead: ["hero", "services", "about", "trust", "contact"],
  },
  "creative-photography": {
    archetypes: ["editorial-premium"],
    heroes: [
      { variant: "fullscreen", prominence: "immersive" },
      { variant: "editorial", prominence: "editorial" },
    ],
    themeFamily: "gallery-minimal",
    typography: ["mixed"],
    colorDirection: ["light", "dark"],
    iconStyle: "line",
    imageStrategy: "hero-led",
    cta: { intent: "quote", strategy: "form-first" },
    density: "spacious",
    visualMood: "gallery-minimal, image-first, quiet frames",
    orderLead: ["hero", "gallery", "services", "about", "contact"],
  },
  retail: {
    archetypes: ["editorial-premium", "local-service-conversion"],
    heroes: [
      { variant: "split", prominence: "split-large" },
      { variant: "editorial", prominence: "full-width" },
    ],
    themeFamily: "clean-light",
    typography: ["sans-led"],
    colorDirection: ["light"],
    iconStyle: "line",
    imageStrategy: "balanced",
    cta: { intent: "order", strategy: "visit-first" },
    density: "compact",
    visualMood: "clean merchandise display, crisp shelves",
    orderLead: ["hero", "services", "gallery", "about", "contact"],
  },
  technology: {
    archetypes: ["editorial-premium", "industrial-bold"],
    heroes: PROFESSIONAL_HEROES,
    themeFamily: "technical-modern",
    typography: ["sans-led"],
    colorDirection: ["light", "dark"],
    iconStyle: "line",
    imageStrategy: "minimal",
    cta: { intent: "quote", strategy: "form-first" },
    density: "regular",
    visualMood: "modern, precise, systems-minded",
    orderLead: ["hero", "services", "about", "trust", "contact"],
  },
  education: {
    archetypes: ["editorial-premium", "local-service-conversion"],
    heroes: PROFESSIONAL_HEROES,
    themeFamily: "trust-classic",
    typography: ["serif-led"],
    colorDirection: ["light"],
    iconStyle: "line",
    imageStrategy: "balanced",
    cta: { intent: "book", strategy: "form-first" },
    density: "regular",
    visualMood: "learning-focused, structured, welcoming",
    orderLead: ["hero", "services", "about", "trust", "contact"],
  },
  fitness: {
    archetypes: ["industrial-bold", "local-service-conversion"],
    heroes: VISUAL_HEROES,
    themeFamily: "energetic",
    typography: ["sans-led"],
    colorDirection: ["dark", "light"],
    iconStyle: "solid",
    imageStrategy: "hero-led",
    cta: { intent: "book", strategy: "call-first" },
    density: "compact",
    visualMood: "energetic, bold hierarchy, strong rhythm",
    orderLead: ["hero", "services", "trust", "about", "contact"],
  },
  "real-estate": {
    archetypes: ["editorial-premium", "industrial-bold"],
    heroes: [
      { variant: "split", prominence: "split-large" },
      { variant: "fullscreen", prominence: "immersive" },
    ],
    themeFamily: "trust-classic",
    typography: ["serif-led"],
    colorDirection: ["light"],
    iconStyle: "line",
    imageStrategy: "project-led",
    cta: { intent: "visit", strategy: "form-first" },
    density: "regular",
    visualMood: "property-led, trustworthy, composed",
    orderLead: ["hero", "services", "projects", "about", "contact"],
  },
  automotive: {
    archetypes: ["industrial-bold", "local-service-conversion"],
    heroes: [
      { variant: "industrial", prominence: "full-width" },
      { variant: "split", prominence: "split-large" },
    ],
    themeFamily: "industrial-steel",
    typography: ["sans-led"],
    colorDirection: ["dark", "light"],
    iconStyle: "solid",
    imageStrategy: "balanced",
    cta: { intent: "book", strategy: "call-first" },
    density: "regular",
    visualMood: "workshop-direct, capable, service-first",
    orderLead: ["hero", "services", "trust", "about", "contact"],
  },
  "home-services": {
    archetypes: ["industrial-bold", "local-service-conversion"],
    heroes: [
      { variant: "split", prominence: "split-large" },
      { variant: "industrial", prominence: "full-width" },
    ],
    themeFamily: "heritage",
    typography: ["sans-led"],
    colorDirection: ["light", "dark"],
    iconStyle: "solid",
    imageStrategy: "balanced",
    cta: { intent: "quote", strategy: "quote-first" },
    density: "regular",
    visualMood: "hands-on, seasonal, neighbourly",
    orderLead: ["hero", "services", "trust", "about", "contact"],
  },
  other: {
    archetypes: ["local-service-conversion", "editorial-premium"],
    heroes: [
      { variant: "split", prominence: "split-large" },
      { variant: "editorial", prominence: "editorial" },
    ],
    themeFamily: "neutral-slate",
    typography: ["mixed"],
    colorDirection: ["light"],
    iconStyle: "line",
    imageStrategy: "balanced",
    cta: { intent: "call", strategy: "call-first" },
    density: "regular",
    visualMood: "clear, versatile, locally grounded",
    orderLead: ["hero", "services", "about", "trust", "contact"],
  },
};

/** Subcategory hints: a nudge inside the family profile, never a second taxonomy. */
/** Subcategory hero hints: the canonical acceptance pairs get a
 * deterministic, content-meaningful hero treatment (e.g. restaurant → an
 * immersive dining-room hero; salon → a split lookbook hero). */
const SUBCATEGORY_HERO_HINT: Record<string, HeroVariantId> = {
  restaurant: "fullscreen", cafe: "split", "fast-food": "split", bakery: "split", catering: "split",
  "hair-salon": "split", barber: "fullscreen", "nail-studio": "split", "lashes-brows": "split", "beauty-studio": "fullscreen",
  hotel: "fullscreen", "guest-house": "split",
  gym: "fullscreen", "personal-training": "split", yoga: "split",
  photographer: "fullscreen", videographer: "split",
};

const SUBCATEGORY_PALETTE_HINT: Record<string, 0 | 1> = {
  barber: 1, "hair-salon": 0, "nail-studio": 0, "lashes-brows": 0, "beauty-studio": 0,
  restaurant: 0, "fast-food": 1, cafe: 0, bakery: 0, catering: 0,
  hotel: 1, "guest-house": 0,
  lawyer: 0, accountant: 0, consultant: 1, insurance: 0,
  gym: 0, "personal-training": 1, yoga: 0,
  photographer: 1, videographer: 0,
};

/** Hero prominence policy per archetype: only variants that render with real
 * visual dominance (or an explicitly editorial treatment) are offered, in
 * policy order. The planner seeds among these; a compact hero is never in
 * the automatic choice space for visual categories. */
const HERO_POLICY: Record<"industrial-bold" | "editorial-premium" | "local-service-conversion", Array<{ variant: HeroVariantId; prominence: HeroProminence }>> = {
  "industrial-bold": [
    { variant: "industrial", prominence: "full-width" },
    { variant: "fullscreen", prominence: "immersive" },
    { variant: "split", prominence: "split-large" },
  ],
  "editorial-premium": [
    { variant: "editorial", prominence: "editorial" },
    { variant: "split", prominence: "split-large" },
    { variant: "fullscreen", prominence: "immersive" },
  ],
  "local-service-conversion": [
    { variant: "fullscreen", prominence: "immersive" },
    { variant: "split", prominence: "split-large" },
  ],
};

/* ── deterministic seeded selection ────────────────────────────────────── */

/** Small deterministic string hash (FNV-1a 32-bit) — same input, same plan. */
const seedOf = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

/** Deterministic pick among ranked options; never out of bounds. */
const seededPick = <T,>(options: T[], seed: number, salt: number): T =>
  options[(seed + salt * 0x9e3779b9) % options.length] as T;

/* ── WCAG contrast guard ───────────────────────────────────────────────── */

const srgbChannel = (value: number): number => {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
};

export const relativeLuminance = (hex: string): number => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 0;
  const int = parseInt(match[1] as string, 16);
  return 0.2126 * srgbChannel((int >> 16) & 255) + 0.7152 * srgbChannel((int >> 8) & 255) + 0.0722 * srgbChannel(int & 255);
};

export const contrastRatio = (foreground: string, background: string): number => {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const mixToward = (hex: string, target: "#000000" | "#ffffff", amount: number): string => {
  const int = parseInt(/^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? "000000", 16);
  const targetInt = target === "#000000" ? 0 : 255;
  const channel = (shift: number) => {
    const current = (int >> shift) & 255;
    return Math.round(current + (targetInt - current) * amount);
  };
  return `#${((1 << 24) | (channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).slice(1)}`;
};

const ensureRatio = (foreground: string, background: string, minimum: number, corrections: string[], label: string): string => {
  let candidate = foreground;
  for (let attempt = 0; attempt < 8 && contrastRatio(candidate, background) < minimum; attempt += 1) {
    // Move the foreground away from the background's luminance pole while keeping its hue.
    const direction: "#000000" | "#ffffff" = relativeLuminance(background) > 0.4 ? "#000000" : "#ffffff";
    candidate = mixToward(candidate, direction, 0.18 + attempt * 0.09);
  }
  if (candidate.toLowerCase() !== foreground.toLowerCase()) {
    corrections.push(`contrast guard: ${label} adjusted to ${candidate} for ${minimum}:1 on ${background}`);
  }
  return candidate;
};

export type ContrastAudit = { pairs: Array<{ label: string; ratio: number; minimum: number; pass: boolean }>; corrected: string[] };

/** Mandatory readability guard for generated palettes (BSRC-DESIGN-P5-001):
 * body text ≥4.5:1 on page and surface, accent/primary as large-text/graphic
 * foreground ≥3:1, and WHITE button labels ≥4.5:1 on the primary fill (the
 * CTA label is white by renderer convention — the body-text token must never
 * be sacrificed to satisfy a dark button background, which is exactly the
 * "gray text that disappears" defect this guard exists to prevent). */
export function enforceThemeContrast(palette: AutomaticPalette): { palette: AutomaticPalette; audit: ContrastAudit } {
  const [primary, accent, background, surface, text] = palette;
  const corrections: string[] = [];
  const guardedText = ensureRatio(text, background, 4.5, corrections, "text on background");
  const guardedTextOnSurface = ensureRatio(guardedText, surface, 4.5, corrections, "text on surface");
  // Accent doubles as the eyebrow micro-label text color in every archetype
  // (small uppercase type), so it must meet the STRICT normal-text bar, not
  // the large-text bar — the P5-001 live acceptance caught the 3.x ratios.
  const guardedAccent = ensureRatio(accent, background, 4.5, corrections, "accent eyebrow on background");
  // Button labels are white on the primary fill: keep the primary dark
  // enough. Primary is a fill/border token in the ds vocabulary, not a body
  // text color, so it is never measured against the page background — doing
  // so would wash dark palettes out to gray (the defect this guard prevents).
  const guardedPrimary = ensureRatio(primary, "#ffffff", 4.5, corrections, "white button label on primary");
  const audit: ContrastAudit = {
    pairs: [
      { label: "text/background", ratio: contrastRatio(guardedText, background), minimum: 4.5, pass: contrastRatio(guardedText, background) >= 4.5 },
      { label: "text/surface", ratio: contrastRatio(guardedTextOnSurface, surface), minimum: 4.5, pass: contrastRatio(guardedTextOnSurface, surface) >= 4.5 },
      { label: "accent/background", ratio: contrastRatio(guardedAccent, background), minimum: 3, pass: contrastRatio(guardedAccent, background) >= 3 },
      { label: "white button label/primary", ratio: contrastRatio("#ffffff", guardedPrimary), minimum: 4.5, pass: contrastRatio("#ffffff", guardedPrimary) >= 4.5 },
    ],
    corrected: corrections,
  };
  return { palette: [guardedPrimary, guardedAccent, background, surface, guardedTextOnSurface], audit };
}

/* ── the planner ───────────────────────────────────────────────────────── */

const PROMINENCE_RANK: Record<HeroProminence, number> = {
  immersive: 4, "full-width": 3, "split-large": 2, editorial: 1, compact: 0,
};

/** Icon semantics for the renderer's service/feature mapping (engine stays
 * framework-free: ids only; apps/web draws the SVGs). Each service gets a
 * semantic match when one exists, and no icon repeats within a site — the
 * renderer tracks taken ids and the mapping falls back to a neutral family
 * only when no semantic match remains. */
export const AUTOMATIC_ICON_IDS = [
  "calendar", "menu", "delivery", "pin", "phone", "mail", "clock", "users",
  "scissors", "palette", "spark", "droplet", "wrench", "crane", "blueprint",
  "gear", "dumbbell", "lotus", "camera", "bed", "coffee", "bag", "key",
  "scale", "heart", "leaf", "shield", "star", "award", "gauge",
  "dot-a", "dot-b", "dot-c", "dot-d",
] as const;
export type AutomaticIconId = (typeof AUTOMATIC_ICON_IDS)[number];

const ICON_KEYWORDS: Array<[AutomaticIconId, RegExp]> = [
  ["calendar", /reserv|book|appoint|termin|takim|rezerv|perjasht|pranish/i],
  ["menu", /menu|cuisine|kuzhin|speise|gjerani|pjat/i],
  ["delivery", /deliver|shp[eë]rndar|liefer|livraison|consegna|transport/i],
  ["pin", /location|address|adres|ort|lage|lokacion|gjet/i],
  ["phone", /phone|call|telefon|thirr|anruf|appel/i],
  ["mail", /mail|e-?post|newsletter|inbox/i],
  ["clock", /hour|open|orar|öffn|heure|orari|24\/7/i],
  ["users", /team|ekip|staff|equipe|personal|crew/i],
  ["scissors", /scissor|hair|flok|fris|raski|prish|coiff|haarschnitt|styling|cut/i],
  ["palette", /colou?r|dye|ngjyr|farb|tinta|colorazione/i],
  ["spark", /style|beaut|bukur|schön|esthetic|esthetic|make-?up|grimi|design/i],
  ["droplet", /wash|laj|wäsche|clean|pastrim|lavaggio/i],
  ["wrench", /repair|fix|tool|rripim|montim|reparatur|werkzeug|maintenance|mirëmbajt/i],
  ["crane", /constru|build|nd[eë]rtim|bau|kran|structure|struktur|steel/i],
  ["blueprint", /plan|projektim|design plan|architect|projekt|planung/i],
  ["gear", /install|montazh|setup|system|sistem|servo/i],
  ["dumbbell", /fitness|gym|training|trajnim|workout|kraft/i],
  ["lotus", /massage|masazh|wellness|spa|yoga|relax/i],
  ["camera", /photograph|foto|camera|video|filming|bilder/i],
  ["bed", /hotel|room|dhom|zimmer|suite|accommodat|q[eë]ndrim/i],
  ["coffee", /caf[eé]|kafene|coffee|breakfast|mëngjes|frühstück/i],
  ["bag", /shop|butik|retail|store|prodakte|produkt|verkauf|sale/i],
  ["key", /real estate|immobilie|property|pasuri|rent|mieten|apartment|banes/i],
  ["scale", /law|legal|ligj|avokat|recht|advokat|attorney|notar/i],
  ["heart", /health|sh[eë]ndet|medic|arzt|therap|terapi|care|kujdes/i],
  ["leaf", /nutrition|ushtyr|ernährung|diet|organic|bio|garden|kopsht/i],
  ["shield", /insur|garanci|warranty|guarantee|safe|sigur|schutz|trust/i],
  ["star", /premium|quality|cil[eë]si|qualit[eä]t|exclusiv|luxury/i],
  ["award", /award|[çc]mim|certif|iso|prize|auszeichnung/i],
  ["gauge", /consult|konsul|berat|analys|audit|strategy|strategji/i],
];

const NEUTRAL_FALLBACKS: AutomaticIconId[] = ["dot-a", "dot-b", "dot-c", "dot-d"];

/** Resolves one service's icon: semantic keyword match first (multilingual),
 * then any semantically fitting not-yet-taken icon, then the neutral family.
 * The same icon is never returned twice for one site (the caller passes the
 * taken set). Returns null only when the caller should skip the icon slot. */
export function mapServiceIcon(serviceTitle: string, taken: ReadonlySet<string>): { icon: AutomaticIconId; semantic: boolean } | null {
  const isTaken = (icon: AutomaticIconId) => taken.has(icon);
  const firstFree = (candidates: AutomaticIconId[]): AutomaticIconId | null =>
    candidates.find((icon) => !isTaken(icon)) ?? null;
  for (const [icon, pattern] of ICON_KEYWORDS) {
    if (pattern.test(serviceTitle) && !isTaken(icon)) return { icon, semantic: true };
  }
  // No exact match free: reuse the closest semantic family's style via a
  // free generic icon before falling back to neutrals.
  const generic = firstFree(["spark", "gear", "star", "shield", "gauge", "leaf", "users"]);
  if (generic) return { icon: generic, semantic: false };
  const neutral = firstFree(NEUTRAL_FALLBACKS);
  return neutral ? { icon: neutral, semantic: false } : null;
}

const sectionOrderFor = (profile: FamilyProfile, archetype: LayoutArchetypeId): SiteSectionId[] => {
  const renderable = new Set(archetypeContracts[archetype].renderableSections);
  const order: SiteSectionId[] = ["hero"];
  for (const section of profile.orderLead) {
    if (section !== "hero" && renderable.has(section) && !order.includes(section)) order.push(section);
  }
  for (const section of archetypeContracts[archetype].defaultSectionOrder) {
    if (renderable.has(section) && !order.includes(section)) order.push(section);
  }
  return order;
};

const sectionVariantsFor = (archetype: LayoutArchetypeId, seed: number): SiteDesignSectionVariants => {
  const contract = archetypeContracts[archetype];
  const pick = <T,>(allowed: readonly T[], fallback: T, salt: number): T =>
    allowed.length > 1 ? seededPick([...allowed] as T[], seed, salt) : (allowed[0] as T) ?? fallback;
  return {
    services: pick(contract.sections.services.variants, contract.sections.services.defaultVariant as never, 1) as never,
    about: pick(contract.sections.about.variants, contract.sections.about.defaultVariant as never, 2) as never,
    contact: pick(contract.sections.contact.variants, contract.sections.contact.defaultVariant as never, 3) as never,
    ...(contract.sections.projects.variants.length && contract.renderableSections.includes("projects")
      ? { projects: pick(contract.sections.projects.variants, contract.sections.projects.defaultVariant as never, 4) as never }
      : {}),
  };
};

/** Plans the automatic site's full design from the category signal. Same
 * input → same plan; different businesses inside one family vary among the
 * family's ranked, category-appropriate options (palette variant, hero
 * variant, section variants) instead of collapsing to contract defaults. */
export function planAutomaticDesign(input: AutomaticDesignInput): AutomaticDesignPlan {
  const profile = FAMILY_PROFILES[input.categoryKey] ?? FAMILY_PROFILES.other;
  const seed = seedOf(`${input.businessName.trim().toLowerCase()}|${input.categoryKey}|${input.subcategoryKey ?? ""}`);
  const archetype = seededPick(profile.archetypes, seed, 0);
  // Hero prominence policy (P5-001 §5): intersect the family's ranked hero
  // list with the chosen archetype's dominance-capable variants and seed-pick
  // among them — two businesses in one family vary while every outcome stays
  // visually dominant; a compact hero is never an automatic default.
  const policy = HERO_POLICY[archetype as keyof typeof HERO_POLICY] ?? [];
  const wanted = new Set(profile.heroes.map((candidate) => candidate.variant));
  const allowedHeroes = policy.filter((candidate) => wanted.has(candidate.variant));
  const hinted = input.subcategoryKey ? SUBCATEGORY_HERO_HINT[input.subcategoryKey] : undefined;
  const hintedChoice = hinted ? allowedHeroes.find((candidate) => candidate.variant === hinted) : undefined;
  const heroChoice = (hintedChoice ?? (allowedHeroes.length ? seededPick(allowedHeroes, seed, 7) : policy[0] ?? profile.heroes[0]!));
  const paletteIndex = (SUBCATEGORY_PALETTE_HINT[input.subcategoryKey ?? ""] ?? (seed % 2 === 0 ? 0 : 1)) as 0 | 1;
  const rawPalette = FAMILY_PALETTES[profile.themeFamily][paletteIndex] ?? FAMILY_PALETTES[profile.themeFamily][0]!;
  const { palette, audit } = enforceThemeContrast(rawPalette);
  const imageStrategy: SiteImageStrategy = input.generatedImageStrategy === "minimal" && profile.imageStrategy === "hero-led"
    ? "balanced"
    : profile.imageStrategy;
  const ctaStrategy = input.ctaIntent
    ? ({ book: "visit-first", call: "call-first", quote: "quote-first", visit: "visit-first", order: "form-first" } as const)[input.ctaIntent]
    : profile.cta.strategy;
  const plan: AutomaticDesignPlan = {
    archetype,
    heroVariant: heroChoice.variant,
    heroProminence: heroChoice.prominence,
    sectionOrder: sectionOrderFor(profile, archetype),
    sectionVariants: sectionVariantsFor(archetype, seed),
    themeFamily: profile.themeFamily,
    themeId: "clarity",
    palette,
    typographyDirection: seededPick(profile.typography, seed, 5),
    colorDirection: seededPick(profile.colorDirection, seed, 6),
    iconStyle: profile.iconStyle,
    imageStrategy,
    ctaStrategy,
    density: profile.density,
    visualMood: profile.visualMood,
    designFingerprint: "",
  };
  plan.designFingerprint = designFingerprintOf(plan);
  void audit;
  return plan;
}

/** Cross-category diversity fingerprint (BSRC-DESIGN-P5-001 §4): the fields
 * two generated websites must not share without a strong content reason. */
export function designFingerprintOf(plan: Pick<
  AutomaticDesignPlan,
  "archetype" | "heroVariant" | "heroProminence" | "sectionOrder" | "themeFamily" | "typographyDirection" | "ctaStrategy" | "imageStrategy"
>): string {
  return [
    plan.archetype,
    plan.heroVariant,
    plan.heroProminence,
    plan.sectionOrder.join(">"),
    plan.themeFamily,
    plan.typographyDirection,
    plan.ctaStrategy,
    plan.imageStrategy,
  ].join("|");
}

/** Materially-different check for the acceptance pairs: counts the fingerprint
 * fields that differ; the P5-001 bar for visibly different categories is ≥3. */
export function fingerprintDifference(left: AutomaticDesignPlan, right: AutomaticDesignPlan): { differingFields: number; fields: string[] } {
  const fields: string[] = [];
  if (left.archetype !== right.archetype) fields.push("archetype");
  if (left.heroVariant !== right.heroVariant) fields.push("heroVariant");
  if (left.heroProminence !== right.heroProminence) fields.push("heroProminence");
  if (left.sectionOrder.join(">") !== right.sectionOrder.join(">")) fields.push("sectionOrder");
  if (left.themeFamily !== right.themeFamily) fields.push("themeFamily");
  if (left.typographyDirection !== right.typographyDirection) fields.push("typographyDirection");
  if (left.ctaStrategy !== right.ctaStrategy) fields.push("ctaStrategy");
  if (left.imageStrategy !== right.imageStrategy) fields.push("imageStrategy");
  return { differingFields: fields.length, fields };
}

/** Converts the plan into the engine's design input + the guarded palette. */
export function automaticPlanToDesignInput(plan: AutomaticDesignPlan): SiteDesignInput {
  return {
    archetype: plan.archetype,
    themeId: (siteThemeIds as readonly string[]).includes(plan.themeId) ? plan.themeId : undefined,
    heroVariant: plan.heroVariant,
    heroProminence: plan.heroProminence,
    sectionOrder: plan.sectionOrder,
    sectionVariants: plan.sectionVariants,
    density: plan.density,
    visualStyle: plan.visualMood,
    typographyDirection: plan.typographyDirection,
    colorDirection: plan.colorDirection,
    imageStrategy: plan.imageStrategy,
    ctaStrategy: plan.ctaStrategy,
    iconStyle: plan.iconStyle,
  };
}

export const AUTOMATIC_SITE_THEME_ID: SiteThemeId = "clarity";
