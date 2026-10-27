import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WebsiteTrialWizard } from "./website-trial-wizard";

const render = (locale: "en" | "de" = "en") => renderToStaticMarkup(
  <WebsiteTrialWizard
    trialDays={14}
    locale={locale}
    supportedLocales={["en", "de", "fr", "es", "it", "sq"]}
  />,
);

describe("homepage wizard category combobox (BSRC-DESIGN-P4-001)", () => {
  it("renders the shared searchable combobox instead of the fixed 20-label select", () => {
    const html = render("en");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('type="hidden" name="categoryKey"');
    expect(html).toContain('type="hidden" name="subcategoryKey"');
    expect(html).not.toMatch(/<select[^>]*name="category"/);
  });

  it("keeps the canonical hidden inputs inside the submitted form", () => {
    const html = render("en");
    expect(html).toContain('name="category"');
    expect(html).toContain('name="businessName"');
  });

  it("localizes the category search placeholder", () => {
    expect(render("de")).toContain("Geschäftskategorie suchen…");
  });

  it("stays renderable server-side without emitting suggestion rows before interaction", () => {
    const html = render("en");
    expect(html).not.toContain('role="option"');
    expect(html).toContain("aria-expanded=\"false\"");
  });
});
