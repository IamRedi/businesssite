import { describe, expect, it } from "vitest";
import { supportedLocales } from "@platform/website-engine";
import { trialStarterContent } from "./trial-starter-content";

const publicCategories = [
  "Hair salon", "Barber", "Beauty studio", "Restaurant", "Fast food",
  "Car repair service", "Car dealership", "Physiotherapy", "Professional services",
  "Pet services", "Cleaning service", "Electrician", "Plumbing", "Construction",
  "Garden and tree care", "Delivery and transport",
  "Medical practice", "Dental practice", "Home care", "Psychotherapy",
];

describe("trialStarterContent", () => {
  it("returns complete, localized starter content for every public category and language", () => {
    for (const locale of supportedLocales) {
      for (const category of publicCategories) {
        const starter = trialStarterContent(category, locale);
        expect(starter.description).not.toHaveLength(0);
        expect(starter.services).toHaveLength(3);
        expect(starter.services.every((service) => Boolean(service.title && service.description))).toBe(true);
        expect(new Set(starter.services.map((service) => service.description)).size).toBe(3);
      }
    }
  });

  it("uses a category-specific automotive introduction in every supported language", () => {
    for (const locale of supportedLocales) {
      expect(trialStarterContent("Car repair service", locale).description).not.toBe(
        trialStarterContent("Unknown category", locale).description,
      );
    }
  });

  it("uses automotive service names rather than generic consultation cards in every language", () => {
    for (const locale of supportedLocales) {
      expect(trialStarterContent("Car repair service", locale).services[0]?.title).not.toBe(
        trialStarterContent("Unknown category", locale).services[0]?.title,
      );
    }
  });

  it("uses the selected template family when a Finder category is too broad", () => {
    const starter = trialStarterContent("Services", "de", "tree-service");
    expect(starter.description).toContain("Garten- und Baumpflegebetrieb");
    expect(starter.services).not.toEqual(trialStarterContent("Unknown category", "de").services);
  });

  it.each([
    ["Services", "medical-practice", "Medical consultation"],
    ["Services", "dental-practice", "Dental consultation"],
    ["Services", "home-care", "Home-care visit"],
    ["Services", "psychotherapy", "Initial conversation"],
  ])("uses the exact health-care template family for a broad Finder category", (category, templateKey, expectedService) => {
    expect(trialStarterContent(category, "en", templateKey).services[0]?.title).toBe(expectedService);
    expect(trialStarterContent(category, "sq", templateKey).services).not.toEqual(
      trialStarterContent("Unknown category", "sq").services,
    );
  });

  it.each([
    "Restaurant", "Fast food", "Barber", "Hair salon", "Beauty studio", "Physiotherapy", "Professional services",
    "Pet services", "Cleaning service", "Electrician", "Plumbing", "Construction", "Garden and tree care", "Delivery and transport",
  ])("uses service cards specific to %s in every language", (category) => {
    for (const locale of supportedLocales) {
      expect(trialStarterContent(category, locale).services).not.toEqual(
        trialStarterContent("Unknown category", locale).services,
      );
    }
  });
});
