import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrivacyMap } from "./privacy-map";

describe("privacy-preserving map", () => {
  it("does not contact or embed Google before visitor activation", () => {
    const html = renderToStaticMarkup(<PrivacyMap address="Example Street 1, Essen" title="Map" directionsLabel="Route" consentText="Load only after selection." loadLabel="Load map" />);
    expect(html).toContain("Load map");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("maps?q=");
  });
});
