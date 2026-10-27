import { describe, expect, it } from "vitest";
import { articleBodyFromText, articleBodyToText, sourcesFromText, tagsFromText } from "./editorial-content";
import { navigationFromText } from "./editorial-form";

describe("manual editorial content", () => {
  it("converts the supported author syntax into non-executable structured blocks", () => {
    const content = articleBodyFromText("Opening paragraph.\n\n## Details\n\n- First\n- Second\n\n> Verified quote");
    expect(content.blocks).toEqual([
      { type: "paragraph", text: "Opening paragraph." },
      { type: "heading", level: 2, text: "Details" },
      { type: "list", style: "unordered", items: ["First", "Second"] },
      { type: "quote", text: "Verified quote" },
    ]);
    expect(articleBodyFromText(articleBodyToText(content))).toEqual(content);
  });

  it("normalizes tags and parses labelled sources", () => {
    expect(tagsFromText("News, Local, news")).toEqual(["News", "Local", "news"]);
    expect(sourcesFromText("Official | https://example.com/report\nhttps://example.com/data")).toEqual([
      { label: "Official", url: "https://example.com/report" },
      { url: "https://example.com/data" },
    ]);
  });

  it("accepts only bounded internal editorial navigation", () => {
    expect(navigationFromText('[{"label":"News","categorySlug":"news"},{"label":"About","href":"/about"}]')).toHaveLength(2);
    expect(() => navigationFromText('[{"label":"External","href":"https://evil.example"}]')).toThrow("invalid_navigation");
    expect(() => navigationFromText("{}")).toThrow("invalid_navigation");
  });
});
