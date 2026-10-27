import { describe, expect, it, vi } from "vitest";
import {
  parseArticleListQuery,
  parseCreateArticle,
  parseMediaUpload,
  parsePublish,
  parseUpdateArticle,
} from "./redi-inbound-contract";

const body = { version: 1, blocks: [{ type: "paragraph", text: "Editorial copy" }] };

describe("REDI CONTROL inbound runtime schemas", () => {
  it("accepts a strict create draft payload", () => {
    expect(parseCreateArticle({ externalReference: "redi-article-42", slug: "market-update", title: "Market update", body })).toMatchObject({
      externalReference: "redi-article-42", slug: "market-update", title: "Market update",
    });
  });

  it("rejects unknown fields, invalid cursors and oversized pagination", () => {
    expect(() => parseCreateArticle({ externalReference: "x", slug: "valid", title: "Title", body, siteId: "forged" })).toThrow("Unknown request field");
    expect(() => parseUpdateArticle({ expectedVersion: 1, patch: { status: "published" } })).toThrow();
    expect(() => parseArticleListQuery(new URL("https://platform.test/articles?limit=51"))).toThrow();
    expect(() => parseArticleListQuery(new URL("https://platform.test/articles?before=2026-01-01T00:00:00Z"))).toThrow();
  });

  it("requires a recent explicit publish approval", () => {
    vi.setSystemTime(new Date("2026-08-19T12:00:00.000Z"));
    expect(parsePublish({ expectedVersion: 2, approval: { approvedBy: "publisher@example.test", approvedAt: "2026-08-19T11:00:00.000Z" } })).toMatchObject({ expectedVersion: 2 });
    expect(() => parsePublish({ expectedVersion: 2, approval: { approvedBy: "publisher@example.test", approvedAt: "2026-08-17T11:00:00.000Z" } })).toThrow("24-hour");
    vi.useRealTimers();
  });

  it("accepts only base64 WebP media contracts", () => {
    expect(parseMediaUpload({ filename: "cover.webp", mimeType: "image/webp", dataBase64: Buffer.from("test").toString("base64") })).toMatchObject({ mimeType: "image/webp" });
    expect(() => parseMediaUpload({ filename: "cover.jpg", mimeType: "image/jpeg", dataBase64: "dGVzdA==" })).toThrow();
  });
});
