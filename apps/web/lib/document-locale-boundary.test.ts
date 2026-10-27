import { describe, expect, it } from "vitest";
import { parseDocumentBoundary, serializeDocumentBoundary } from "./document-locale-boundary";

describe("document locale boundary", () => {
  it("separates owner, platform and tenant documents", () => {
    expect(parseDocumentBoundary(serializeDocumentBoundary({ kind: "owner" }))).toEqual({ kind: "owner" });
    expect(parseDocumentBoundary(serializeDocumentBoundary({ kind: "platform", locale: "de" }))).toEqual({ kind: "platform", locale: "de" });
    expect(parseDocumentBoundary(serializeDocumentBoundary({ kind: "site", value: "mein-betrieb" }))).toEqual({ kind: "site", value: "mein-betrieb" });
    expect(parseDocumentBoundary(serializeDocumentBoundary({ kind: "domain", value: "kunde.example" }))).toEqual({ kind: "domain", value: "kunde.example" });
  });

  it("rejects forged or unsafe boundary values", () => {
    expect(parseDocumentBoundary("platform:fr")).toBeNull();
    expect(parseDocumentBoundary("site:../owner")).toBeNull();
    expect(parseDocumentBoundary("unknown:value")).toBeNull();
  });
});
