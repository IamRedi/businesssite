import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";

export type WebsitePageEvidence = {
  url: string;
  title?: string;
  description?: string;
  text: string;
  structuredData: Array<Record<string, unknown>>;
  images: Array<{ url: string; alt: string }>;
  /** Raw first-page markup only, for deterministic brand-asset extraction. */
  html?: string;
};

export type WebsiteResearch = {
  sourceUrl: string;
  pagesRead: number;
  pages: WebsitePageEvidence[];
  images: Array<{ url: string; alt: string; pageUrl: string }>;
  contactHints: {
    emails: string[];
    phones: string[];
    socialLinks: string[];
  };
};

const blockedIpv4 = (address: string) => {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || a >= 224;
};

export function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return !blockedIpv4(address);
  if (family === 6) {
    const normalized = address.toLowerCase();
    return normalized !== "::" && normalized !== "::1" && !normalized.startsWith("fc") &&
      !normalized.startsWith("fd") && !normalized.startsWith("fe8") && !normalized.startsWith("fe9") &&
      !normalized.startsWith("fea") && !normalized.startsWith("feb") && !normalized.startsWith("::ffff:");
  }
  return false;
}

const decodeEntities = (value: string) => value
  .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");

export function extractReadableText(html: string, maximum = 12_000) {
  return decodeEntities(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<\/(?:p|div|section|article|header|footer|nav|main|h[1-6]|li|dt|dd|tr)>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maximum);
}

const attribute = (tag: string, name: string) => {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? decodeEntities(match[2].trim()) : undefined;
};

const metaContent = (html: string, key: string) => {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const property = attribute(tag, "property") ?? attribute(tag, "name");
    if (property?.toLowerCase() === key.toLowerCase()) return attribute(tag, "content");
  }
  return undefined;
};

function sourceImages(html: string, pageUrl: string) {
  const base = new URL(pageUrl);
  const images: Array<{ url: string; alt: string }> = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = attribute(tag, "src") ?? attribute(tag, "data-src") ?? attribute(tag, "data-lazy-src");
    if (!src || src.startsWith("data:")) continue;
    try {
      const url = new URL(src, base);
      if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== base.hostname) continue;
      if (!/\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(url.pathname + url.search)) continue;
      url.hash = "";
      images.push({ url: url.toString(), alt: attribute(tag, "alt")?.slice(0, 240) ?? "" });
    } catch { /* Ignore malformed or cross-site image URLs. */ }
  }
  return [...new Map(images.map((image) => [image.url, image])).values()].slice(0, 16);
}

function publicStructuredData(html: string) {
  const records: Array<Record<string, unknown>> = [];
  const scripts = html.matchAll(/<script\b[^>]*type\s*=\s*(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi);
  const usefulKeys = new Set([
    "@type", "name", "description", "telephone", "email", "url", "address", "streetAddress",
    "addressLocality", "postalCode", "addressCountry", "openingHours", "openingHoursSpecification",
    "dayOfWeek", "opens", "closes", "sameAs", "serviceType", "areaServed", "priceRange",
  ]);
  const sanitize = (value: unknown, depth = 0): unknown => {
    if (depth > 5) return undefined;
    if (typeof value === "string") return value.trim().slice(0, 1_000);
    if (value === null || ["number", "boolean"].includes(typeof value)) return value;
    if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
    if (typeof value !== "object") return undefined;
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (usefulKeys.has(key) || key === "@graph") {
        const cleaned = sanitize(child, depth + 1);
        if (cleaned !== undefined) result[key] = cleaned;
      }
    }
    return result;
  };
  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[2]) as unknown;
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates.slice(0, 20)) {
        const cleaned = sanitize(candidate);
        if (cleaned && typeof cleaned === "object" && Object.keys(cleaned).length) records.push(cleaned as Record<string, unknown>);
      }
    } catch { /* Ignore malformed third-party JSON-LD. */ }
  }
  return records.slice(0, 30);
}

export function extractPageEvidence(html: string, url: string, maximumCharacters = 5_000): WebsitePageEvidence {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return {
    url,
    title: titleMatch ? extractReadableText(titleMatch[1], 200) : undefined,
    description: metaContent(html, "description") ?? metaContent(html, "og:description"),
    text: extractReadableText(html, maximumCharacters),
    structuredData: publicStructuredData(html),
    images: sourceImages(html, url),
  };
}

export function extractPageHtml(html: string, maximum = 400_000) {
  return html.slice(0, maximum);
}

async function validatedTarget(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Only public HTTP(S) website URLs are allowed.");
  if (isIP(url.hostname)) throw new Error("IP-address website URLs are not allowed.");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  const target = addresses.find((item) => isPublicAddress(item.address));
  if (!target || addresses.some((item) => !isPublicAddress(item.address))) throw new Error("The website resolves to a private or unsafe network address.");
  return { url, target };
}

type HtmlResponse = { html: string; finalUrl: string };

async function requestHtml(rawUrl: string, remainingRedirects: number, maximumBytes: number): Promise<HtmlResponse> {
  const { url, target } = await validatedTarget(rawUrl);
  const transport = url.protocol === "https:" ? https : http;
  return await new Promise<HtmlResponse>((resolve, reject) => {
    const request = transport.request({
      protocol: url.protocol, hostname: target.address, family: target.family, port: url.port || undefined,
      path: `${url.pathname}${url.search}`, method: "GET", servername: url.hostname,
      headers: { host: url.host, accept: "text/html,application/xhtml+xml", "accept-encoding": "identity", "user-agent": "WhiteLabelWebsiteAnalyzer/1.1" },
      timeout: 10_000,
    }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (remainingRedirects <= 0) return reject(new Error("The website redirected too many times."));
        const next = new URL(response.headers.location, url).toString();
        requestHtml(next, remainingRedirects - 1, maximumBytes).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) { response.resume(); return reject(new Error(`Website returned HTTP ${status}.`)); }
      const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) { response.resume(); return reject(new Error("Website did not return HTML content.")); }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maximumBytes) { request.destroy(new Error("Website content is too large.")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ html: Buffer.concat(chunks).toString("utf8"), finalUrl: url.toString() }));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("Website analysis timed out.")));
    request.on("error", reject);
    request.end();
  });
}

const pageKeywords = [
  "contact", "kontakt", "impressum", "about", "ueber", "uber", "wir", "team", "service", "services",
  "leistung", "leistungen", "angebot", "opening", "hours", "zeiten", "horaires", "orari", "horario",
  "oeffnung", "servizi", "servicios", "prestations", "chi-siamo", "nosotros", "a-propos", "contatti",
  "equipe", "rreth", "sherbim", "orar",
];

function relevantLinks(html: string, baseUrl: string) {
  const base = new URL(baseUrl);
  const links: Array<{ url: string; score: number }> = [];
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(decodeEntities(match[2]), base);
      if (!["http:", "https:"].includes(url.protocol) || url.hostname !== base.hostname) continue;
      url.hash = "";
      const haystack = `${url.pathname} ${extractReadableText(match[3], 200)}`.toLowerCase();
      const score = pageKeywords.reduce((total, keyword) => total + (haystack.includes(keyword) ? 1 : 0), 0);
      if (score && !/\.(?:pdf|jpe?g|png|gif|webp|svg|zip)$/i.test(url.pathname)) links.push({ url: url.toString(), score });
    } catch { /* Ignore invalid links. */ }
  }
  return [...new Map(links.sort((a, b) => b.score - a.score).map((item) => [item.url, item])).values()];
}

function contactHints(html: string, text: string) {
  const decoded = decodeEntities(html);
  const emails = [...new Set([
    ...(decoded.match(/mailto:([^?"'\s>]+)/gi) ?? []).map((item) => item.slice(7)),
    ...(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []),
  ].map((item) => item.trim().toLowerCase()).filter(Boolean))].slice(0, 10);
  const phones = [...new Set([
    ...(decoded.match(/tel:([^?"'\s>]+)/gi) ?? []).map((item) => item.slice(4)),
  ].map((item) => {
    try { return decodeURIComponent(item).replace(/\s+/g, " ").trim(); } catch { return item.trim(); }
  }).filter(Boolean))].slice(0, 10);
  const socialLinks = [...new Set((decoded.match(/https?:\/\/(?:www\.)?(?:instagram\.com|facebook\.com|fb\.com|tiktok\.com|linkedin\.com)\/[^"'\s<]+/gi) ?? [])
    .map((item) => item.replace(/[),.;]+$/, "")))].slice(0, 15);
  return { emails, phones, socialLinks };
}

export async function readPublicWebsite(url: string, maximumCharacters = 20_000, maximumPages = 6): Promise<WebsiteResearch> {
  const first = await requestHtml(url, 3, 1_000_000);
  const firstUrl = new URL(first.finalUrl);
  const pages: WebsitePageEvidence[] = [];
  const rawPages: string[] = [];
  const queue = [first.finalUrl, ...relevantLinks(first.html, first.finalUrl).map((item) => item.url)];
  const visited = new Set<string>();
  let remaining = maximumCharacters;

  while (queue.length && pages.length < Math.max(1, Math.min(maximumPages, 10)) && remaining > 200) {
    const candidate = queue.shift()!;
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    try {
      const response = candidate === first.finalUrl ? first : await requestHtml(candidate, 3, 1_000_000);
      const resolved = new URL(response.finalUrl);
      if (resolved.hostname !== firstUrl.hostname) continue;
      const evidence = extractPageEvidence(response.html, response.finalUrl, Math.min(5_000, remaining));
      if (pages.length === 0) evidence.html = extractPageHtml(response.html);
      if (evidence.text.length < 40 && !evidence.structuredData.length) continue;
      pages.push(evidence);
      rawPages.push(response.html);
      remaining -= evidence.text.length + JSON.stringify(evidence.structuredData).length;
      if (pages.length === 1) {
        for (const link of relevantLinks(response.html, response.finalUrl)) if (!visited.has(link.url)) queue.push(link.url);
      }
    } catch {
      // One unavailable secondary page must not discard useful evidence from other pages.
    }
  }

  if (!pages.length || pages.every((page) => page.text.length < 80 && !page.structuredData.length)) {
    throw new Error("The website did not contain enough readable information to analyze.");
  }
  const hints = rawPages.map((html, index) => contactHints(html, pages[index]?.text ?? ""));
  return {
    sourceUrl: first.finalUrl,
    pagesRead: pages.length,
    pages,
    images: pages.flatMap((page) => page.images.map((image) => ({ ...image, pageUrl: page.url })))
      .filter((image, index, all) => all.findIndex((candidate) => candidate.url === image.url) === index)
      .slice(0, 24),
    contactHints: {
      emails: [...new Set(hints.flatMap((item) => item.emails))].slice(0, 10),
      phones: [...new Set(hints.flatMap((item) => item.phones))].slice(0, 10),
      socialLinks: [...new Set(hints.flatMap((item) => item.socialLinks))].slice(0, 15),
    },
  };
}
