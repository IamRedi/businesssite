import { describe, expect, it } from "vitest";
import type { PreparedBusinessProfile } from "./contracts";
import { generateSiteDocument } from "./generate";
import { selectBusinessTemplate } from "./template-catalog";

describe("professional-services template selection", () => {
  it.each([
    "Professional services",
    "Professional service",
    "Business advisory",
    "Këshillim profesional",
    "Keshillim profesional",
  ])("maps %s to the consultation family", (category) => {
    expect(selectBusinessTemplate(category).key).toBe("consultation");
  });

  it("generates professional imagery and never vehicle-workshop imagery", () => {
    const profile: PreparedBusinessProfile = {
      id: "prepared-professional-v1",
      version: 1,
      sourceLeadId: "lead-professional",
      locale: "sq",
      preparedAt: "2026-08-19T00:00:00.000Z",
      approvedSources: [],
      business: {
        name: "Këshillim Profesional",
        category: "Professional services",
        description: "Këshillim i strukturuar për vendime të qarta biznesi.",
      },
      services: [
        { title: "Konsultim fillestar" },
        { title: "Analizë e nevojave" },
        { title: "Mbështetje e vazhdueshme" },
      ],
    };

    const site = generateSiteDocument(profile);
    const allImages = [
      site.media.heroImageUrl,
      ...site.media.serviceImageUrls,
      ...site.media.galleryImageUrls,
    ];

    expect(site.templateKey).toBe("consultation");
    expect(site.media.heroImageUrl).toBe(
      "/images/templates/wl-professional-consultation-v1.png",
    );
    expect(allImages.every((image) => !image.includes("auto-repair"))).toBe(true);
  });
});

describe("health-specialist template selection", () => {
  it("evaluates the embedded phrase input and keeps physiotherapy separate from therapy practice", () => {
    expect(
      selectBusinessTemplate(
        undefined,
        "Physio Kitchen - physiotherapy practice",
      ).key,
    ).toBe("physiotherapy");
  });

  it("recognizes the canonical provider category independently", () => {
    expect(selectBusinessTemplate("Physical Therapist").key).toBe(
      "physiotherapy",
    );
  });

  it("normalizes Unicode accents and case before matching", () => {
    expect(selectBusinessTemplate("PHYSIOTHÉRAPIE").key).toBe(
      "physiotherapy",
    );
  });

  it("rejects physiotherapy and therapy terms without a leading word boundary", () => {
    const match = selectBusinessTemplate("microphysiotherapy");
    expect(match.key).not.toBe("physiotherapy");
    expect(match.key).not.toBe("psychotherapy");
  });

  it("treats a preceding non-BMP Unicode letter as part of the same word", () => {
    const match = selectBusinessTemplate("\u{10400}physiotherapy");
    expect(match.key).not.toBe("physiotherapy");
    expect(match.key).not.toBe("psychotherapy");
  });

  it("uses caller input order as the deterministic ambiguity tie-breaker", () => {
    expect(
      selectBusinessTemplate(
        "Psychotherapy practice",
        "Physiotherapy practice",
      ).key,
    ).toBe("psychotherapy");
    expect(
      selectBusinessTemplate(
        "Physiotherapy practice",
        "Psychotherapy practice",
      ).key,
    ).toBe("physiotherapy");
  });

  it("continues to select psychotherapy for a real psychotherapy practice", () => {
    expect(selectBusinessTemplate("Psychotherapy practice").key).toBe(
      "psychotherapy",
    );
  });
});
