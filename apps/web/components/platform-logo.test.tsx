import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlatformLogo } from "./platform-logo";

describe("PlatformLogo", () => {
  it("renders the landing descriptor with the primary logo", () => {
    const html = renderToStaticMarkup(<PlatformLogo tagline />);

    expect(html).toContain("Website RemoteControl");
    expect(html).toContain("businesssite-logo-horizontal-v3.png");
  });

  it("keeps the footer variant compact and without the descriptor", () => {
    const html = renderToStaticMarkup(<PlatformLogo compact />);

    expect(html).toContain("platform-logo-image compact");
    expect(html).not.toContain("Website RemoteControl");
  });
});
