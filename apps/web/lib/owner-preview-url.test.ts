import { describe, expect, it } from "vitest";
import { canonicalOwnerPreviewUrl, canonicalPublicPathUrl, canonicalPublicSiteUrl } from "./owner-preview-url";

describe("canonicalOwnerPreviewUrl", () => {
  it("moves a private preview path to the canonical public host without losing its token", () => {
    expect(
      canonicalOwnerPreviewUrl(
        "/preview/private-token_123",
        "https://www.businesssiterc.de",
      ),
    ).toBe("https://www.businesssiterc.de/preview/private-token_123");
  });

  it("preserves an absolute private preview URL on the canonical public host", () => {
    expect(
      canonicalOwnerPreviewUrl(
        "https://www.businesssiterc.de/preview/private-token_123",
        "https://www.businesssiterc.de",
      ),
    ).toBe("https://www.businesssiterc.de/preview/private-token_123");
  });

  it("fails closed for a preview URL on another host", () => {
    expect(() =>
      canonicalOwnerPreviewUrl(
        "https://attacker.example/preview/private-token_123",
        "https://www.businesssiterc.de",
      ),
    ).toThrow("The private preview URL is invalid.");
  });

  it("fails closed when the returned path is not a private preview", () => {
    expect(() =>
      canonicalOwnerPreviewUrl(
        "/owner/leads/private-token_123",
        "https://www.businesssiterc.de",
      ),
    ).toThrow("The private preview URL is invalid.");
  });
});

describe("canonicalPublicSiteUrl", () => {
  it("binds a published site link to the canonical public host", () => {
    expect(canonicalPublicSiteUrl("barberi-i-qytetit", "https://www.businesssiterc.de"))
      .toBe("https://www.businesssiterc.de/site/barberi-i-qytetit");
  });

  it("fails closed for slugs that are not canonical site paths", () => {
    expect(() => canonicalPublicSiteUrl("../owner", "https://www.businesssiterc.de")).toThrow();
    expect(() => canonicalPublicSiteUrl("", "https://www.businesssiterc.de")).toThrow();
    expect(() => canonicalPublicSiteUrl("Has_Underscore", "https://www.businesssiterc.de")).toThrow();
  });

  it("fails closed for a non-http canonical origin", () => {
    expect(() => canonicalPublicSiteUrl("barberi-i-qytetit", "ftp://www.businesssiterc.de")).toThrow("The canonical public URL is invalid.");
    expect(() => canonicalPublicSiteUrl("barberi-i-qytetit", "https://user:pass@www.businesssiterc.de")).toThrow("The canonical public URL is invalid.");
  });
});

describe("canonicalPublicPathUrl", () => {
  it("keeps a customer setup link on the canonical public host including its query", () => {
    expect(canonicalPublicPathUrl("/site-admin/reset-password?token=abc123", "https://www.businesssiterc.de"))
      .toBe("https://www.businesssiterc.de/site-admin/reset-password?token=abc123");
  });

  it("fails closed for protocol-relative or foreign paths", () => {
    expect(() => canonicalPublicPathUrl("//attacker.example/x", "https://www.businesssiterc.de")).toThrow("The public path is invalid.");
    expect(() => canonicalPublicPathUrl("https://attacker.example/x", "https://www.businesssiterc.de")).toThrow("The public path is invalid.");
  });
});
