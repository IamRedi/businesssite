import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "./same-origin";

describe("same-origin mutation protection", () => {
  it("keeps exact HTTPS and port authority behind a private HTTP upstream", () => {
    process.env.PUBLIC_APP_URL = "https://platform.example";
    process.env.CONTROL_PANEL_HOST = "control.platform.example:8443";
    const request = (host: string, origin?: string, fetchSite = "same-origin") =>
      new Request("http://internal-web:3000/api/mutation", {
        method: "POST", headers: { host, ...(origin ? { origin } : {}), "sec-fetch-site": fetchSite, "x-forwarded-proto": "http" },
      });
    try {
      expect(isSameOriginRequest(request("platform.example", "https://platform.example"))).toBe(true);
      expect(isSameOriginRequest(request("control.platform.example:8443", "https://control.platform.example:8443"))).toBe(true);
      expect(isSameOriginRequest(request("control.platform.example:8443", "http://control.platform.example:8443"))).toBe(false);
      expect(isSameOriginRequest(request("control.platform.example:8443", "https://control.platform.example"))).toBe(false);
      expect(isSameOriginRequest(request("platform.example", "https://attacker.example"))).toBe(false);
      expect(isSameOriginRequest(request("platform.example"))).toBe(false);
      expect(isSameOriginRequest(request("platform.example", "https://platform.example", "cross-site"))).toBe(false);
    } finally {
      delete process.env.PUBLIC_APP_URL;
      delete process.env.CONTROL_PANEL_HOST;
    }
  });
  it("accepts the configured application origin", () => {
    process.env.PUBLIC_APP_URL = "https://platform.example";
    expect(
      isSameOriginRequest(
        new Request("https://platform.example/api/subscribe", {
          method: "POST",
          headers: {
            origin: "https://platform.example",
            "sec-fetch-site": "same-origin",
          },
        }),
      ),
    ).toBe(true);
    delete process.env.PUBLIC_APP_URL;
  });

  it("accepts the configured control origin only for requests targeting that host", () => {
    process.env.PUBLIC_APP_URL = "https://platform.example";
    process.env.CONTROL_PANEL_HOST = "control.platform.example";
    const headers = {
      origin: "https://control.platform.example",
      "sec-fetch-site": "same-origin",
    };

    expect(
      isSameOriginRequest(
        new Request("https://control.platform.example/api/owner/auth/login", {
          method: "POST",
          headers,
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginRequest(
        new Request("https://platform.example/api/owner/auth/login", {
          method: "POST",
          headers,
        }),
      ),
    ).toBe(false);

    delete process.env.CONTROL_PANEL_HOST;
    delete process.env.PUBLIC_APP_URL;
  });

  it("accepts only the exact isolated Vercel deployment origin", () => {
    process.env.PUBLIC_APP_URL = "https://platform.example";
    process.env.VERCEL_URL = "candidate-test.vercel.app";
    const request = (origin: string, target = "candidate-test.vercel.app") =>
      new Request(`https://${target}/api/owner/auth/login`, {
        method: "POST",
        headers: { origin, "sec-fetch-site": "same-origin" },
      });
    expect(isSameOriginRequest(request("https://candidate-test.vercel.app"))).toBe(true);
    expect(isSameOriginRequest(request("https://attacker.vercel.app"))).toBe(false);
    expect(isSameOriginRequest(request("https://candidate-test.vercel.app", "other.vercel.app"))).toBe(false);
    delete process.env.VERCEL_URL;
    delete process.env.PUBLIC_APP_URL;
  });

  it("rejects missing, cross-origin and cross-site browser requests", () => {
    process.env.PUBLIC_APP_URL = "https://platform.example";
    expect(
      isSameOriginRequest(
        new Request("https://platform.example/api/subscribe", {
          method: "POST",
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        new Request("https://platform.example/api/subscribe", {
          method: "POST",
          headers: { origin: "https://attacker.example" },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        new Request("https://platform.example/api/subscribe", {
          method: "POST",
          headers: {
            origin: "https://platform.example",
            "sec-fetch-site": "cross-site",
          },
        }),
      ),
    ).toBe(false);
    delete process.env.PUBLIC_APP_URL;
  });
});
