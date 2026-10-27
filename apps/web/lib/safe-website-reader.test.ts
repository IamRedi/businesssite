import { describe, expect, it } from "vitest";
import { extractPageEvidence, extractReadableText, isPublicAddress } from "./safe-website-reader";

describe("safe website reader", () => {
  it("blocks private and metadata networks", () => {
    expect(isPublicAddress("127.0.0.1")).toBe(false);
    expect(isPublicAddress("169.254.169.254")).toBe(false);
    expect(isPublicAddress("10.1.2.3")).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
  });
  it("extracts visible content without scripts", () => {
    expect(extractReadableText("<h1>Salon &amp; Spa</h1><script>secret()</script><p>Welcome</p>")).toBe("Salon & Spa\nWelcome");
  });
  it("preserves useful metadata and public local-business JSON-LD", () => {
    const html = `<html><head><title>Maison Belle</title><meta name="description" content="Beauty studio in Essen">
      <script type="application/ld+json">{"@type":"BeautySalon","name":"Maison Belle","telephone":"+49 201 1234","openingHours":["Mo-Fr 09:00-18:00"],"image":"ignored.jpg"}</script>
      </head><body><h1>Professional beauty care</h1><p>Facials and styling by appointment.</p></body></html>`;
    expect(extractPageEvidence(html, "https://example.test/")).toMatchObject({
      title: "Maison Belle",
      description: "Beauty studio in Essen",
      structuredData: [{ "@type": "BeautySalon", name: "Maison Belle", telephone: "+49 201 1234", openingHours: ["Mo-Fr 09:00-18:00"] }],
    });
  });
  it("keeps only same-host raster image candidates for source-led demos", () => {
    const html = `<img src="/uploads/groundworks.jpg" alt="Groundworks excavation"><img data-src="https://example.test/media/paving.webp" alt="Paving work"><img src="https://other.example/photo.jpg" alt="Ignore">`;
    expect(extractPageEvidence(html, "https://example.test/services").images).toEqual([
      { url: "https://example.test/uploads/groundworks.jpg", alt: "Groundworks excavation" },
      { url: "https://example.test/media/paving.webp", alt: "Paving work" },
    ]);
  });
});
