import type { SiteDocument } from "./contracts";
import { parsePriceList } from "./price-list";

export const customSections = ["hero", "services", "pricing", "gallery", "video", "about", "hours", "contact", "cta", "social", "legal", "footer"] as const;
export type CustomSection = typeof customSections[number];
export const galleryCategories = ["Haircuts", "Beard", "Shaving", "Salon", "Results"] as const;
export type GalleryCategory = typeof galleryCategories[number];
export type CustomSiteDesign = {
  version: "custom/1";
  layout: "cinematic-editorial";
  hero: "portrait-split" | "full-image";
  sections: CustomSection[];
  variants: { services: "numbered-list" | "image-cards"; about: "portrait"; contact: "location" };
  tokens: { background: string; surface: string; text: string; accent: string; muted: string };
  typography: "classic" | "modern";
  iconStyle: "line" | "solid";
  gallery: { aspect: "portrait" | "landscape" | "square"; lightbox: boolean; categories: GalleryCategory[] };
  video: { mode: "showcase" | "decorative-loop"; aspect: "portrait" | "landscape"; maxDurationSeconds: number };
  cta: "call-first" | "visit-first" | "form-first";
  mediaRules: { hero: "hero"; logo: "logo"; gallery: "gallery"; service: "service"; portrait: "portrait"; poster: "video-poster" };
};
export type CustomImage = { id: string; role: "hero" | "logo" | "gallery" | "service" | "portrait" | "video-poster"; src: string; alt: string; width: number; height: number; category?: GalleryCategory };
export type CustomVideo = { id: string; title: string; posterId: string; width: number; height: number; durationSeconds: number; sources: Array<{ src: string; type: "video/mp4" | "video/webm"; bytes: number }> };
export type CustomSiteMedia = { images: CustomImage[]; videos: CustomVideo[] };
export type CustomDesignPreset = { schema: "custom-preset/1"; design: CustomSiteDesign };

export const premiumCustomDesign: CustomSiteDesign = {
  version: "custom/1", layout: "cinematic-editorial", hero: "portrait-split",
  sections: ["hero", "services", "gallery", "video", "about", "hours", "contact", "cta", "legal", "footer"],
  variants: { services: "numbered-list", about: "portrait", contact: "location" },
  tokens: { background: "#111110", surface: "#1c1b18", text: "#f7f1e5", accent: "#d7b578", muted: "#beb6a7" },
  typography: "classic", iconStyle: "line", gallery: { aspect: "portrait", lightbox: true, categories: [] },
  video: { mode: "showcase", aspect: "portrait", maxDurationSeconds: 30 }, cta: "call-first",
  mediaRules: { hero: "hero", logo: "logo", gallery: "gallery", service: "service", portrait: "portrait", poster: "video-poster" },
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}
function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error("Unsupported custom design option.");
  return value as T;
}
function number(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error("Invalid media dimensions or limits.");
  return value;
}
function boolean(value: unknown) { if (typeof value !== "boolean") throw new Error("Expected boolean."); return value; }
function text(value: unknown, max: number) { if (typeof value !== "string" || value.length > max) throw new Error("Invalid media text."); return value; }
function array(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) throw new Error("Invalid custom collection."); return value; }
function hex(value: unknown) { if (typeof value !== "string" || !/^#[a-f0-9]{6}$/i.test(value)) throw new Error("Use six-digit hex colors."); return value; }
function luminance(hex: string) {
  const c = hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
}
export function customContrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }

/** Reconstruct an allowlisted composition: never spread source objects into a preset. */
export function parseCustomDesign(input: unknown): CustomSiteDesign {
  const v = object(input), variants = object(v.variants), t = object(v.tokens), g = object(v.gallery), video = object(v.video), rules = object(v.mediaRules);
  const sections = array(v.sections, customSections.length).map(s => choice(s, customSections));
  if (new Set(sections).size !== sections.length || sections[0] !== "hero" || sections.at(-1) !== "footer" || !sections.includes("legal") || !sections.includes("contact")) throw new Error("Hero, contact, legal and footer are required; sections must be unique.");
  const tokens = { background: hex(t.background), surface: hex(t.surface), text: hex(t.text), accent: hex(t.accent), muted: hex(t.muted) };
  for (const background of [tokens.background, tokens.surface]) for (const foreground of [tokens.text, tokens.accent, tokens.muted]) if (customContrast(foreground, background) < 4.5) throw new Error("Custom palette must pass WCAG AA.");
  if (customContrast(tokens.background, tokens.accent) < 4.5) throw new Error("CTA contrast fails.");
  return { version: choice(v.version, ["custom/1"]), layout: choice(v.layout, ["cinematic-editorial"]), hero: choice(v.hero, ["portrait-split", "full-image"]), sections,
    variants: { services: choice(variants.services, ["numbered-list", "image-cards"]), about: choice(variants.about, ["portrait"]), contact: choice(variants.contact, ["location"]) }, tokens,
    typography: choice(v.typography, ["classic", "modern"]), iconStyle: choice(v.iconStyle, ["line", "solid"]), gallery: { aspect: choice(g.aspect, ["portrait", "landscape", "square"]), lightbox: boolean(g.lightbox), categories: [...new Set(array(g.categories, 5).map(c => choice(c, galleryCategories)))] },
    video: { mode: choice(video.mode, ["showcase", "decorative-loop"]), aspect: choice(video.aspect, ["portrait", "landscape"]), maxDurationSeconds: number(video.maxDurationSeconds, 1, video.mode === "decorative-loop" ? 12 : 60) }, cta: choice(v.cta, ["call-first", "visit-first", "form-first"]),
    mediaRules: { hero: choice(rules.hero, ["hero"]), logo: choice(rules.logo, ["logo"]), gallery: choice(rules.gallery, ["gallery"]), service: choice(rules.service, ["service"]), portrait: choice(rules.portrait, ["portrait"]), poster: choice(rules.poster, ["video-poster"]) } };
}
export function safeCustomMediaUrl(input: unknown): string {
  const v = text(input, 2048);
  if (/^\/(?!\/)[a-zA-Z0-9_./%-]+$/.test(v) && !v.includes("..")) return v;
  try { const u = new URL(v); if (u.protocol === "https:" && !u.username && !u.password) return v; } catch { /* reject */ }
  throw new Error("Media must use HTTPS or an origin-relative asset path.");
}
export function parseCustomMedia(input: unknown): CustomSiteMedia {
  const v = object(input);
  const images = array(v.images, 60).map(raw => { const i = object(raw); return { id: text(i.id, 80), role: choice(i.role, ["hero", "logo", "gallery", "service", "portrait", "video-poster"]), src: safeCustomMediaUrl(i.src), alt: text(i.alt, 240), width: number(i.width, 1, 8192), height: number(i.height, 1, 8192), ...(i.category === undefined ? {} : { category: choice(i.category, galleryCategories) }) }; });
  const videos = array(v.videos, 8).map(raw => { const i = object(raw); return { id: text(i.id, 80), title: text(i.title, 160), posterId: text(i.posterId, 80), width: number(i.width, 1, 3840), height: number(i.height, 1, 3840), durationSeconds: number(i.durationSeconds, 1, 60), sources: array(i.sources, 2).map(raw => { const s = object(raw); return { src: safeCustomMediaUrl(s.src), type: choice(s.type, ["video/mp4", "video/webm"]), bytes: number(s.bytes, 1, 4_000_000) }; }) }; });
  const ids = [...images, ...videos].map(i => i.id);
  if (ids.some(id => !/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) || new Set(ids).size !== ids.length) throw new Error("Media IDs must be unique slug keys.");
  for (const video of videos) if (!video.sources.length || !images.some(i => i.id === video.posterId && i.role === "video-poster")) throw new Error("Every video needs sources and a poster image.");
  return { images, videos };
}
export function exportCustomPreset(design: unknown): CustomDesignPreset { return { schema: "custom-preset/1", design: parseCustomDesign(design) }; }
export function importCustomPreset(input: unknown) { const v = object(input); choice(v.schema, ["custom-preset/1"]); return parseCustomDesign(v.design); }
export function applyCustomDesign(site: SiteDocument, design: unknown, media: unknown): SiteDocument {
  const d = parseCustomDesign(design), m = parseCustomMedia(media);
  if (m.videos.some(v => v.durationSeconds > d.video.maxDurationSeconds)) throw new Error("Video exceeds composition duration policy.");
  return { ...site, ...(site.priceList === undefined ? {} : { priceList: parsePriceList(site.priceList) }), customDesign: d, customMedia: m };
}
export function hasCustomDesign(site: SiteDocument): boolean {
  if (!site.customDesign || !site.customMedia) return false;
  try { applyCustomDesign(site, site.customDesign, site.customMedia); return true; } catch { return false; }
}
