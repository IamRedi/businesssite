import { describe, expect, it } from "vitest";
import { supportedPlatformLocales } from "./platform-config";
import { ownerNavigationCopy, ownerOperationsCopy } from "./owner-navigation-copy";

describe("owner operations translations", () => {
  it("covers every configured locale with navigation and operational pages", () => {
    for (const locale of supportedPlatformLocales) {
      expect(ownerNavigationCopy[locale].customers.length).toBeGreaterThan(2);
      expect(ownerNavigationCopy[locale].promotions.length).toBeGreaterThan(2);
      expect(ownerNavigationCopy[locale].providerUsage.length).toBeGreaterThan(2);
      expect(ownerOperationsCopy[locale].customers.states.past_due.length).toBeGreaterThan(2);
      expect(ownerOperationsCopy[locale].searches.cachedFilter.length).toBeGreaterThan(2);
    }
  });
});
