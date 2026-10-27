import { readPublicWebsite, type WebsiteResearch } from "./safe-website-reader";

export type WebsiteImportErrorCode =
  | "invalid_request"
  | "rate_limited"
  | "import_blocked"
  | "import_dns"
  | "import_timeout"
  | "import_not_html"
  | "import_oversized"
  | "import_redirect"
  | "import_unreachable"
  | "import_unreadable"
  | "import_unavailable";

/**
 * Maps a failed analysis to a safe, user-presentable class. Only errors thrown
 * by our own canonical reader are matched; unknown failures stay generic.
 */
export function classifyWebsiteImportError(error: unknown): WebsiteImportErrorCode {
  const code = (error as { code?: string } | null)?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ENODATA") return "import_dns";
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/Only public HTTP|IP-address website URLs|private or unsafe network address/.test(message)) return "import_blocked";
  if (/timed out/i.test(message)) return "import_timeout";
  if (/did not return HTML/i.test(message)) return "import_not_html";
  if (/too large/i.test(message)) return "import_oversized";
  if (/redirected too many times/i.test(message)) return "import_redirect";
  if (/returned HTTP \d+/.test(message)) return "import_unreachable";
  if (/did not contain enough readable/i.test(message)) return "import_unreadable";
  return "import_unavailable";
}

export type ImportedContact = {
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
};

export type ImportedLegalSuggestion = {
  legalBusinessName?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
  contactEmail?: string;
};

/**
 * Deterministic, review-first extraction from the customer's declared previous
 * website. Free text is never copied verbatim into the new site; the review
 * step decides what is kept. Facts (contact, assets, services) carry the
 * source page they came from.
 */
export type WebsiteImportPreview = {
  sourceUrl: string;
  fetchedAt: string;
  pagesRead: number;
  businessName?: string;
  suggestedHero?: { title?: string; subtitle?: string };
  aboutExcerpt?: string;
  services: string[];
  priceRange?: string;
  contact: ImportedContact;
  socialLinks: string[];
  logoUrl?: string;
  faviconUrl?: string;
  colors: string[];
  fonts: string[];
  photos: Array<{ url: string; alt: string }>;
  /** Only clearly published legal facts; every field is a suggestion for review. */
  legalSuggestions: ImportedLegalSuggestion;
  sourceLanguage?: string;
  openingHours: string[];
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const countryByTld: Record<string, string> = {
  de: "DE", at: "AT", ch: "CH", al: "AL", fr: "FR", es: "ES", it: "IT", xk: "XK",
};

const stopwords: Record<string, string[]> = {
  de: ["der", "die", "das", "und", "mit", "für", "wir", "sie", "ihre"],
  en: ["the", "and", "for", "with", "your", "our", "you"],
  fr: ["les", "des", "une", "pour", "avec", "vous", "notre"],
  es: ["los", "las", "una", "para", "con", "su ", "usted"],
  it: ["gli", "delle", "per ", "con ", "sono", "nostro"],
  sq: ["dhe", "një", "për", "me ", "shërbime", "biznesi", "juaj"],
};

/** Lightweight stopword scoring, used only to decide whether source free text can be reused verbatim. */
export function detectWebsiteLanguage(text: string): string | undefined {
  const haystack = ` ${text.toLowerCase().slice(0, 4_000)} `;
  let best: { language: string; score: number } | undefined;
  for (const [language, words] of Object.entries(stopwords)) {
    const score = words.reduce((total, word) => total + (haystack.includes(` ${word} `) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { language, score };
  }
  return best && best.score >= 2 ? best.language : undefined;
}

const attribute = (tag: string, name: string) => {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? match[2].trim().slice(0, 500) : undefined;
};

function brandColors(html: string): string[] {
  const counts = new Map<string, number>();
  const record = (candidate?: string) => {
    const match = candidate?.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi);
    for (const color of match ?? []) counts.set(color.toLowerCase(), (counts.get(color.toLowerCase()) ?? 0) + 1);
  };
  for (const style of html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) ?? []) record(style);
  for (const tag of html.match(/<[a-z]\b[^>]*style\s*=\s*(["'])[\s\S]*?\1[^>]*>/gi) ?? []) record(tag);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([color]) => color);
}

function brandFonts(html: string): string[] {
  const families = new Set<string>();
  for (const match of html.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const first = match[1].split(",")[0]?.trim().replace(/^["']|["']$/g, "");
    if (first && /^[A-Za-z][\w\s-]{1,40}$/.test(first) && !/^(?:inherit|initial|unset|sans-serif|serif|monospace)$/i.test(first))
      families.add(first);
  }
  for (const match of html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([\w+,:;]+)/gi)) {
    const first = decodeURIComponent(match[1]).split(":")[0]?.replace(/\+/g, " ");
    if (first) families.add(first);
  }
  return [...families].slice(0, 5);
}

function faviconUrl(html: string, baseUrl: string): string | undefined {
  const base = new URL(baseUrl);
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attribute(match[0], "rel")?.toLowerCase() ?? "";
    if (!/(?:^|\s)(?:icon|apple-touch-icon|shortcut\s+icon)(?:\s|$)/.test(rel)) continue;
    const href = attribute(match[0], "href");
    if (!href) continue;
    try {
      const url = new URL(href, base);
      if (url.hostname !== base.hostname) continue;
      return url.toString();
    } catch { /* ignore malformed favicon hrefs */ }
  }
  return undefined;
}

function structuredServices(records: Array<Record<string, unknown>>): string[] {
  const services = new Set<string>();
  const visit = (value: unknown, depth = 0) => {
    if (depth > 4 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) return void value.forEach((item) => visit(item, depth + 1));
    const record = value as Record<string, unknown>;
    for (const key of ["makesOffer", "hasOfferCatalog", "hasMenuSection", "department"]) visit(record[key], depth + 1);
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const type = typeof record["@type"] === "string" ? record["@type"] : "";
    if (name && ["Offer", "Service"].includes(type) && name.length <= 80) services.add(name);
    if (typeof record.serviceType === "string" && record.serviceType.trim().length <= 80) services.add(record.serviceType.trim());
  };
  for (const record of records) visit(record);
  return [...services].slice(0, 12);
}

function structuredOpeningHours(records: Array<Record<string, unknown>>): string[] {
  const hours = new Set<string>();
  const visit = (value: unknown, depth = 0) => {
    if (depth > 4 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) return void value.forEach((item) => visit(item, depth + 1));
    const record = value as Record<string, unknown>;
    if (typeof record.openingHours === "string" && record.openingHours.trim())
      record.openingHours.split(";").forEach((part) => hours.add(part.trim().slice(0, 60)));
    for (const key of ["openingHoursSpecification"]) visit(record[key], depth + 1);
    if (typeof record.dayOfWeek === "string" && typeof record.opens === "string" && typeof record.closes === "string")
      hours.add(`${record.dayOfWeek} ${record.opens}-${record.closes}`.slice(0, 60));
  };
  for (const record of records) visit(record);
  return [...hours].slice(0, 10);
}

function legalFacts(
  research: WebsiteResearch,
  contact: ImportedContact,
): ImportedLegalSuggestion {
  const suggestion: ImportedLegalSuggestion = {};
  let addressRecord: Record<string, unknown> | undefined;
  let legalName: string | undefined;
  let sameAsEmail: string | undefined;
  const visit = (value: unknown, depth = 0) => {
    if (depth > 4 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) return void value.forEach((item) => visit(item, depth + 1));
    const record = value as Record<string, unknown>;
    const type = typeof record["@type"] === "string" ? record["@type"].toLowerCase() : "";
    if (!addressRecord && record.address && typeof record.address === "object") addressRecord = record.address as Record<string, unknown>;
    // Accept any LocalBusiness-family record: schema.org has many subtypes
    // (HairSalon, AutoRepair, ...). A name plus contact facts identifies them.
    if (!legalName && typeof record.name === "string" && record.name.trim() &&
        (record.address || typeof record.telephone === "string"))
      legalName = record.name.trim().slice(0, 160);
    if (!sameAsEmail && typeof record.email === "string" && emailPattern.test(record.email.trim())) sameAsEmail = record.email.trim().toLowerCase();
    for (const key of ["@graph", "founder", "address", "contactPoint", "department"]) visit(record[key], depth + 1);
  };
  for (const record of research.pages.flatMap((page) => page.structuredData)) visit(record);
  const street = typeof addressRecord?.streetAddress === "string" ? addressRecord.streetAddress.trim().slice(0, 160) : undefined;
  const city = typeof addressRecord?.addressLocality === "string" ? addressRecord.addressLocality.trim().slice(0, 80) : undefined;
  const postalCode = typeof addressRecord?.postalCode === "string" ? addressRecord.postalCode.trim().slice(0, 20) : undefined;
  const countryCode = typeof addressRecord?.addressCountry === "string"
    ? addressRecord.addressCountry.trim().toUpperCase().slice(0, 2)
    : undefined;
  if (legalName) suggestion.legalBusinessName = legalName;
  if (street) suggestion.street = street;
  if (city) suggestion.city = city;
  if (postalCode) suggestion.postalCode = postalCode;
  if (countryCode && /^[A-Z]{2}$/.test(countryCode)) suggestion.countryCode = countryCode;
  else {
    const tld = new URL(research.sourceUrl).hostname.split(".").at(-1)?.toLowerCase() ?? "";
    if (countryByTld[tld]) suggestion.countryCode = countryByTld[tld];
  }
  if (sameAsEmail) suggestion.contactEmail = sameAsEmail;
  else if (contact.email && emailPattern.test(contact.email)) suggestion.contactEmail = contact.email;
  return suggestion;
}

export function buildImportPreview(research: WebsiteResearch): WebsiteImportPreview {
  const home = research.pages[0];
  const homeHtml = home?.html ?? "";
  const ogTitle = homeHtml.match(/<meta\b[^>]*property\s*=\s*["']og:title["'][^>]*>/i);
  const ogDescription = homeHtml.match(/<meta\b[^>]*property\s*=\s*["']og:description["'][^>]*>/i);
  const themeColor = homeHtml.match(/<meta\b[^>]*name\s*=\s*["']theme-color["'][^>]*>/i);
  const attributeValue = (match: RegExpMatchArray | null) => {
    if (!match) return undefined;
    const value = match[0].match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i);
    return value?.[2]?.trim().slice(0, 200) || undefined;
  };
  const jsonLdName = (() => {
    for (const record of home?.structuredData ?? []) {
      const type = typeof record["@type"] === "string" ? record["@type"].toLowerCase() : "";
      if (typeof record.name === "string" && record.name.trim() &&
          (["localbusiness", "organization", "professionalservice", "store", "restaurant"].includes(type) ||
            record.address || typeof record.telephone === "string"))
        return record.name.trim().slice(0, 160);
    }
    return undefined;
  })();
  const priceRange = (() => {
    for (const record of home?.structuredData ?? [])
      if (typeof record.priceRange === "string" && record.priceRange.trim()) return record.priceRange.trim().slice(0, 40);
    return undefined;
  })();
  const sourceHost = new URL(research.sourceUrl).hostname.replace(/^www\./, "");
  const text = research.pages.map((page) => page.text).join("\n");
  const phoneFromText = (() => {
    for (const match of text.matchAll(/\+\d[\d\s().-]{7,18}\d/g)) {
      const candidate = match[0].trim();
      if ((candidate.replace(/\D/g, "").length) >= 8 && (candidate.replace(/\D/g, "").length) <= 15) return candidate;
    }
    return undefined;
  })();
  const sameSiteEmail = (emails: string[]) =>
    [...emails].sort((a, b) => Number(b.includes(sourceHost)) - Number(a.includes(sourceHost)))[0];
  const contact: ImportedContact = {
    phone: research.contactHints.phones[0] ?? phoneFromText,
    email: (() => {
      const valid = research.contactHints.emails.filter((email) => emailPattern.test(email));
      return sameSiteEmail(valid);
    })(),
    address: (() => {
      for (const record of home?.structuredData ?? []) {
        const address = record.address;
        if (address && typeof address === "object") {
          const street = (address as Record<string, unknown>).streetAddress;
          if (typeof street === "string" && street.trim()) return street.trim().slice(0, 200);
        }
      }
      return undefined;
    })(),
    city: (() => {
      for (const record of home?.structuredData ?? []) {
        const address = record.address;
        if (address && typeof address === "object") {
          const locality = (address as Record<string, unknown>).addressLocality;
          if (typeof locality === "string" && locality.trim()) return locality.trim().slice(0, 80);
        }
      }
      return undefined;
    })(),
  };
  const jsonLdLogo = (() => {
    for (const record of home?.structuredData ?? []) {
      const logo = record.logo;
      const url = typeof logo === "string" ? logo : typeof logo === "object" && logo ? (logo as Record<string, unknown>).url : undefined;
      if (typeof url === "string") return url;
    }
    return undefined;
  })();
  const baseOrigin = new URL(research.sourceUrl).origin;
  const sameOriginAsset = (candidate: string) => {
    try {
      const url = new URL(candidate, research.sourceUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.origin !== baseOrigin) return undefined;
      url.hash = "";
      return url.toString();
    } catch { return undefined; }
  };
  const favicon = faviconUrl(homeHtml, research.sourceUrl);
  const logoCandidate = jsonLdLogo ? sameOriginAsset(jsonLdLogo) : undefined;
  // Defense in depth: the canonical reader already restricts images to the
  // declared origin; keep only same-origin raster image files here as well.
  const looksLikeImageFile = (candidate: string) => /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(new URL(candidate).pathname + new URL(candidate).search);
  const heroMatch = research.images.find((image) => /hero|banner|cover|header/i.test(`${image.alt} ${image.url}`));
  const heroCandidateRaw = sameOriginAsset(heroMatch?.url ?? "");
  const heroCandidate = heroCandidateRaw && looksLikeImageFile(heroCandidateRaw) && heroCandidateRaw !== favicon ? heroCandidateRaw : undefined;
  const photos = research.images
    .map((image) => ({ url: sameOriginAsset(image.url), alt: image.alt.slice(0, 200) }))
    .filter((image): image is { url: string; alt: string } => Boolean(image.url))
    .filter((image) => looksLikeImageFile(image.url) && image.url !== logoCandidate && image.url !== favicon)
    .slice(0, 12);
  const colors = [...new Set([
    ...(attributeValue(themeColor) && /^#[0-9a-f]{3,6}$/i.test(attributeValue(themeColor)!) ? [attributeValue(themeColor)!] : []),
    ...brandColors(homeHtml),
  ])].slice(0, 6);
  const sourceLanguage = detectWebsiteLanguage(text);
  return {
    sourceUrl: research.sourceUrl,
    fetchedAt: new Date().toISOString(),
    pagesRead: research.pagesRead,
    businessName: (jsonLdName
      ?? (research.pages.flatMap((page) => page.structuredData).find((record) => typeof record.name === "string")?.name as string | undefined)
      ?? home?.title?.split(/[|–—·]/)[0]?.trim()) || undefined,
    suggestedHero: {
      title: attributeValue(ogTitle) ?? home?.title,
      subtitle: attributeValue(ogDescription) ?? home?.description,
    },
    aboutExcerpt: home?.description,
    services: structuredServices(home?.structuredData ?? []),
    priceRange,
    contact,
    socialLinks: research.contactHints.socialLinks.slice(0, 6),
    logoUrl: logoCandidate ?? (favicon ? undefined : undefined),
    faviconUrl: favicon,
    colors,
    fonts: brandFonts(homeHtml),
    photos: heroCandidate && !photos.some((photo) => photo.url === heroCandidate)
      ? [{ url: heroCandidate, alt: "hero" }, ...photos].slice(0, 12)
      : photos,
    legalSuggestions: legalFacts(research, contact),
    sourceLanguage,
    openingHours: structuredOpeningHours(home?.structuredData ?? []),
  };
}

export async function analyzeWebsiteForImport(url: string): Promise<{ preview: WebsiteImportPreview; research: WebsiteResearch }> {
  const research = await readPublicWebsite(url, 16_000, 5);
  return { preview: buildImportPreview(research), research };
}
