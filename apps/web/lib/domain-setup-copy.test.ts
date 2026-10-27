import { describe, expect, it } from "vitest";
import { domainSetupCopy } from "./domain-setup-copy";

describe("custom-domain setup translations", () => {
  it("contains the complete secure setup flow in every supported locale", () => {
    for (const copy of Object.values(domainSetupCopy)) {
      expect(copy.title).toBeTruthy();
      expect(copy.existingTitle).toBeTruthy();
      expect(copy.buyTitle).toBeTruthy();
      expect(copy.comingSoon).toBeTruthy();
      expect(Object.values(copy.states).every(Boolean)).toBe(true);
      expect(Object.values(copy.messages).every(Boolean)).toBe(true);
      expect(Object.values(copy.purposes).every(Boolean)).toBe(true);
    }
  });
});
