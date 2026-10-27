import { describe, expect, it } from "vitest";
import { ctaColors } from "./design-archetypes";

describe("call-to-action colours", () => {
  it("keeps the primary colour when it stands out from the page", () => {
    expect(ctaColors({ primary: "#26282c", accent: "#8a6d3b", background: "#f7f7f8", surface: "#ffffff", text: "#26282c" })).toEqual({});
  });

  it("switches to the accent with readable ink when the primary disappears on a dark page", () => {
    expect(ctaColors({ primary: "#212327", accent: "#b48d54", background: "#1f2124", surface: "#2a2d31", text: "#f2f2f3" }))
      .toEqual({ "--site-cta": "#b48d54", "--site-cta-ink": "#1f2124" });
  });

  it("falls back to the text colour when the accent is also too close to the page", () => {
    expect(ctaColors({ primary: "#212327", accent: "#2a2d31", background: "#1f2124", surface: "#2a2d31", text: "#f2f2f3" }))
      .toEqual({ "--site-cta": "#f2f2f3", "--site-cta-ink": "#1f2124" });
  });
});
