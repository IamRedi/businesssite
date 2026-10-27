import { describe, expect, it } from "vitest";
import { customerUiLocaleFromCookieHeader, exactLegalDocumentLocale, isWebsiteContentLocale, resolveCustomerUiLocale } from "./locale-model";

describe("locale model boundaries", () => {
  it("limits customer UI and legal documents to EN/DE", () => {
    expect(resolveCustomerUiLocale("de")).toBe("de");
    expect(resolveCustomerUiLocale("fr")).toBe("en");
    expect(exactLegalDocumentLocale("de")).toBe("de");
    expect(exactLegalDocumentLocale("fr")).toBeNull();
  });

  it("keeps all six website content locales", () => {
    expect(["en", "de", "fr", "es", "it", "sq"].every(isWebsiteContentLocale)).toBe(true);
  });

  it("derives customer locale from the trusted cookie value", () => {
    expect(customerUiLocaleFromCookieHeader("other=1; platform_locale=de")).toBe("de");
    expect(customerUiLocaleFromCookieHeader("platform_locale=sq")).toBe("en");
  });
});
