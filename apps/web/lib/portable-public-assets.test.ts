import { describe, expect, it } from "vitest";
import { config } from "../proxy";

describe("portable public asset proxy boundary", () => {
  const matches = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);
  it("lets Next's headerless internal image fetch reach only public static files", () => {
    expect(matches("/images/brand/businesssite-logo.png")).toBe(false);
    expect(matches("/_next/static/chunks/example.js")).toBe(false);
    for (const path of ["/api/media/private-id", "/api/owner/auth/login", "/owner", "/site-admin", "/customer-domain", "/images-private", "/api/health"]) expect(matches(path)).toBe(true);
  });
});
