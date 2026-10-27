import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const styles = readFileSync(resolve(root, "app/styles.css"), "utf8").replace(/\r\n/g, "\n");
const landing = readFileSync(resolve(root, "app/page.tsx"), "utf8");
const preview = readFileSync(resolve(root, "app/preview/[slug]/page.tsx"), "utf8");

describe("staging accessibility regression contract", () => {
  it("keeps generated-site functional text on contrast-safe theme colors", () => {
    expect(styles).toContain("background: var(--site-primary);");
    expect(styles).toContain("color: var(--site-ink);");
    expect(styles).toContain(".site-appointments > div > p:first-child {\n  color: #fff;");
    expect(styles).toContain(".business-login-link {\n  color: inherit;\n  font-size: 0.68rem;\n  opacity: 1;");
  });

  it("keeps the mobile gallery keyboard-focusable", () => {
    expect(landing).toContain('className="launch2-gallery-grid" tabIndex={0} aria-label={copy.gallery.title}');
  });

  it("keeps private previews titled and non-indexable", () => {
    expect(preview).toContain('title: { absolute: "Private website preview" }');
    expect(preview).toContain("robots: { index: false, follow: false }");
  });
});
