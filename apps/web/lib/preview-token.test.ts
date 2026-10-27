import { beforeEach, describe, expect, it } from "vitest";
import { previewToken, previewTokenId } from "./preview-token";

describe("private preview token", () => {
  beforeEach(() => {
    process.env.PREVIEW_TOKEN_SECRET = "a-secure-preview-secret-with-at-least-32-bytes";
  });

  it("accepts a signed token and denies a guessed slug or modified signature", () => {
    const token = previewToken("8f660011-1111-4222-8333-123456789abc");
    expect(previewTokenId(token)).toBe("8f660011-1111-4222-8333-123456789abc");
    expect(previewTokenId("arthurs-hair-club")).toBeNull();
    expect(previewTokenId(`${token.slice(0, -1)}x`)).toBeNull();
  });
});
