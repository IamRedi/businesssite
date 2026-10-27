import { describe, expect, it } from "vitest";
import { informationAdFormats, informationAdSlotKeys, supportedLocales } from "@platform/website-engine";
import { informationAdCopy } from "./information-ad-copy";

describe("information ad-slot copy", () => {
  it("covers every locale, slot and format without executable markup", () => {
    for (const locale of supportedLocales) {
      const copy = informationAdCopy[locale];
      expect(copy.advertisement.length).toBeGreaterThan(0);
      for (const slot of informationAdSlotKeys) expect(copy.slots[slot].length).toBeGreaterThan(0);
      for (const format of informationAdFormats) expect(copy.formats[format].length).toBeGreaterThan(0);
      expect(JSON.stringify(copy)).not.toMatch(/<script|javascript:|<iframe/i);
    }
  });
});
