import { describe, expect, it } from "vitest";
import { decodeArticleCursor, encodeArticleCursor, normalizeEditorialSlug } from "./public-information-routing";

describe("public information routing", () => {
  it("normalizes safe article and category slugs", () => {
    expect(normalizeEditorialSlug(" Latest-News ")).toBe("latest-news");
    expect(normalizeEditorialSlug("../private")).toBeNull();
    expect(normalizeEditorialSlug("not allowed")).toBeNull();
  });

  it("round-trips bounded opaque pagination cursors", () => {
    const cursor = { publishedAt: "2026-08-19T12:00:00.000Z", id: "53d7301c-90d3-4e60-95ce-ab9271702c13" };
    expect(decodeArticleCursor(encodeArticleCursor(cursor))).toEqual(cursor);
    expect(decodeArticleCursor("invalid")).toBeUndefined();
  });
});
