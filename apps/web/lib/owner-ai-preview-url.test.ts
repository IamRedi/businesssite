import { describe, expect, it } from "vitest";

import { canonicalOwnerAiPreviewUrl } from "./owner-ai-preview-url";

describe("canonicalOwnerAiPreviewUrl", () => {
  it("moves an AI preview to the canonical public host without losing its token", () => {
    expect(
      canonicalOwnerAiPreviewUrl(
        "/preview/private-token.signature",
        "https://www.businesssiterc.de",
      ),
    ).toBe("https://www.businesssiterc.de/preview/private-token.signature");
  });

  it("fails closed for a foreign absolute preview origin", () => {
    expect(() =>
      canonicalOwnerAiPreviewUrl(
        "https://attacker.example/preview/private-token.signature",
        "https://www.businesssiterc.de",
      ),
    ).toThrow();
  });
});
