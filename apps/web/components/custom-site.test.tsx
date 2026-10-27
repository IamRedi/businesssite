import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { generateSiteDocument, applyCustomDesign, premiumCustomDesign, type PreparedBusinessProfile } from "@platform/website-engine";
import { SitePreview } from "./site-preview";
const profile: PreparedBusinessProfile = { id: "custom-fixture", version: 1, sourceLeadId: "custom-fixture", locale: "de", business: { name: "Example Studio", city: "Example city" }, services: [{ title: "Service" }], approvedSources: [], preparedAt: "2026-10-03T00:00:00Z" };
describe("custom renderer isolation and media behavior", () => {
  it("adds one appointment utility section before contact without changing the custom composition", () => {
    const site = applyCustomDesign(generateSiteDocument(profile), premiumCustomDesign, { images: [], videos: [] });
    const html = renderToStaticMarkup(<SitePreview site={site} />);
    const sectionIds = [...html.matchAll(/<section[^>]*\sid="([^"]+)"/g)].map(match => match[1]);
    expect(sectionIds).toEqual(["hero", "services", "about", "appointments", "contact", "legal"]);
    expect(html).toContain('id="appointments"');
    expect(html).toContain('href="/site/example-studio/privacy"');
    expect(html).toContain('role="status"');
    expect((html.match(/id="appointments"/g) ?? [])).toHaveLength(1);
  });
  it("reserves image dimensions; video sources are absent until visible; no autoplay in the initial document", () => {
    const site = applyCustomDesign(generateSiteDocument(profile), premiumCustomDesign, { images: [{ id: "hero", role: "hero", src: "/real.webp", alt: "Real photo", width: 640, height: 960 }, { id: "poster", role: "video-poster", src: "/poster.webp", alt: "Poster", width: 640, height: 960 }], videos: [{ id: "video", title: "Real clip", width: 640, height: 960, durationSeconds: 12, posterId: "poster", sources: [{ src: "/web.mp4", type: "video/mp4", bytes: 180000 }] }] });
    const html = renderToStaticMarkup(<SitePreview site={site} />);
    expect(html).toContain('data-custom-design="custom/1"');
    expect(html).toContain('fetchPriority="high"');
    expect(html).toContain('preload="none"');
    expect(html).toContain('playsInline=""');
    expect(html).not.toContain('<source');
    expect(html).not.toContain('autoPlay');
    expect(html).not.toContain('web.mp4');
  });
  it("ignores malformed custom state and preserves the legacy/automatic/import renderer HTML", () => {
    const site = generateSiteDocument(profile);
    const before = renderToStaticMarkup(<SitePreview site={site} />);
    expect(renderToStaticMarkup(<SitePreview site={{ ...site, customDesign: {} as never, customMedia: { images: [], videos: [] } }} />)).toBe(before);
    expect(before).not.toContain('data-custom-design');
  });
});
