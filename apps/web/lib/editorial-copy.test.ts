import { describe, expect, it } from "vitest";
import { editorialCopy } from "./editorial-copy";

const locales = ["de", "en", "fr", "es", "it", "sq"] as const;

function everyString(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (value && typeof value === "object") return Object.values(value).every(everyString);
  return false;
}

describe("editorial CMS translations", () => {
  it("provides complete copy for every supported locale", () => {
    for (const locale of locales) expect(everyString(editorialCopy[locale])).toBe(true);
  });

  it("localizes the primary workflow outside English", () => {
    for (const locale of locales.filter((locale) => locale !== "en")) {
      expect(editorialCopy[locale].list.create).not.toBe(editorialCopy.en.list.create);
      expect(editorialCopy[locale].form.save).not.toBe(editorialCopy.en.form.save);
      expect(editorialCopy[locale].settings.title).not.toBe(editorialCopy.en.settings.title);
    }
  });
});
