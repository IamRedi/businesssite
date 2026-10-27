import { describe, expect, it } from "vitest";
import { createOwnerPublicationDocument, publicationSlug } from "./owner-publication";

describe("owner publication setup", () => {
  it("creates a public document with a safe slug", () => {
    const site = createOwnerPublicationDocument({ publicationName: "Info Esencë", locale: "sq", subcategory: "news", themeKey: "gold" });
    expect(site).toMatchObject({ visibility: "public", slug: "info-esence", locale: "sq", themeKey: "gold" });
  });
  it("normalizes an explicit publication URL", () => expect(publicationSlug(" News / Köln! ")).toBe("news-koln"));
});
