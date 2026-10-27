import { describe, expect, it } from "vitest";
import { supportedLocales } from "@platform/website-engine";
import { publicInformationCopy } from "./public-information-copy";

describe("public information copy", () => {
  it("provides every public renderer label in all supported locales", () => {
    const keys = Object.keys(publicInformationCopy.en).sort();
    for (const locale of supportedLocales) {
      expect(Object.keys(publicInformationCopy[locale]).sort()).toEqual(keys);
      expect(Object.values(publicInformationCopy[locale]).every((value) => value.trim().length > 0)).toBe(true);
    }
  });
});
