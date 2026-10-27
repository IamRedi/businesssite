import { describe, expect, it } from "vitest";
import { businessWorkspaceUiCopy, workspaceCategoryFor, workspaceCategoryKeys } from "./business-workspace";

describe("business workspace categorization", () => {
  it.each([
    ["Locksmith", "trade"],
    ["Dental practice", "health-care"],
    ["Car repair service", "vehicle"],
    ["Restaurant", "food"],
    ["Tree service", "garden"],
  ] as const)("maps %s to %s", (category, expected) => {
    expect(workspaceCategoryFor(category)).toBe(expected);
  });

  it("provides every category label in all supported locales", () => {
    for (const copy of Object.values(businessWorkspaceUiCopy)) {
      expect(workspaceCategoryKeys.every((key) => Boolean(copy.categories[key]))).toBe(true);
      expect(copy.websiteChange.website_added).toBeTruthy();
      expect(copy.websiteChange.website_removed).toBeTruthy();
    }
  });
});
