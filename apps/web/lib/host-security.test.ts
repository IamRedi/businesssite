import { describe, expect, it } from "vitest";
import {
  configuredPlatformHosts,
  configuredControlPanelHost,
  classifyHostRequest,
  customerDomainRewritePath,
  isCanonicalPlatformNavigation,
  isCustomerDomainPassThrough,
  normalizeCustomDomainHost,
  normalizeRequestHost,
  trustedCustomerDomainHost,
} from "./host-security";

describe("trusted host handling", () => {
  it("normalizes ports, trailing dots and international domain names", () => {
    expect(normalizeRequestHost("Example.COM.:443")).toBe("example.com");
    expect(normalizeCustomDomainHost("www.bücher.de:443")).toBe("xn--bcher-kva.de");
  });

  it("rejects ambiguous or injected host values", () => {
    expect(normalizeRequestHost("platform.test,evil.test")).toBeNull();
    expect(normalizeRequestHost("evil.test@platform.test")).toBeNull();
    expect(normalizeRequestHost("platform.test/path")).toBeNull();
  });

  it("allows only exact configured deployment hosts", () => {
    const hosts = configuredPlatformHosts({
      NODE_ENV: "production",
      PUBLIC_APP_URL: "https://platform.example",
      VERCEL_URL: "white-label-git-main-team.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "news.customer.example",
      CONTROL_PANEL_HOST: "control.platform.example",
      PLATFORM_ADDITIONAL_HOSTS: "admin.example,www.platform.example",
    });
    expect(hosts.has("platform.example")).toBe(true);
    expect(hosts.has("white-label-git-main-team.vercel.app")).toBe(true);
    expect(hosts.has("news.customer.example")).toBe(false);
    expect(hosts.has("control.platform.example")).toBe(true);
    expect(hosts.has("attacker.vercel.app")).toBe(false);
    expect(configuredControlPanelHost({ CONTROL_PANEL_HOST: "CONTROL.Platform.Example.:443" })).toBe("control.platform.example");
  });

  it("limits the custom-domain surface to site assets and customer APIs", () => {
    expect(isCustomerDomainPassThrough("/images/templates/hero.webp")).toBe(true);
    expect(isCustomerDomainPassThrough("/api/public/appointments")).toBe(true);
    expect(isCustomerDomainPassThrough("/api/owner/search")).toBe(false);
    expect(isCanonicalPlatformNavigation("/site-admin/login")).toBe(true);
    expect(isCanonicalPlatformNavigation("/owner/login")).toBe(false);
  });

  it("allowlists only clean information-site paths", () => {
    expect(customerDomainRewritePath("/")).toBe("/customer-domain");
    expect(customerDomainRewritePath("/articles/verified-report")).toBe("/customer-domain/articles/verified-report");
    expect(customerDomainRewritePath("/privacy")).toBe("/customer-domain/privacy");
    expect(customerDomainRewritePath("/category/local-news")).toBe("/customer-domain/category/local-news");
    expect(customerDomainRewritePath("/articles/../owner")).toBeNull();
    expect(customerDomainRewritePath("/articles/Verified")).toBeNull();
    expect(customerDomainRewritePath("/api/public/trials")).toBeNull();
    expect(customerDomainRewritePath("/site-admin/example")).toBeNull();
  });

  it("never accepts a platform or spoofed host as a customer-domain identity", () => {
    const platformHosts = new Set(["platform.example", "preview.vercel.app"]);
    expect(trustedCustomerDomainHost("news.example", platformHosts)).toBe("news.example");
    expect(trustedCustomerDomainHost("platform.example", platformHosts)).toBeNull();
    expect(trustedCustomerDomainHost("platform.example@news.example", platformHosts)).toBeNull();
  });

  it("never treats an arbitrary Vercel or customer host as the platform", () => {
    const platformHosts = new Set(["platform.example", "expected-preview.vercel.app"]);
    const classify = (host: string, pathname: string, method = "GET") =>
      classifyHostRequest({ host, pathname, method, platformHosts });
    expect(classify("platform.example", "/owner")).toBe("platform");
    expect(classify("attacker.vercel.app", "/owner")).toBe("reject");
    expect(classify("customer.example", "/")).toBe("customer-site");
    expect(classify("customer.example", "/articles/verified-report")).toBe("customer-site");
    expect(classify("customer.example", "/category/local-news", "HEAD")).toBe("customer-site");
    expect(classify("customer.example", "/articles/verified-report", "POST")).toBe("reject");
    expect(classify("customer.example", "/api/public/appointments", "POST")).toBe("customer-pass-through");
    expect(classify("customer.example", "/site-admin/login")).toBe("canonical-redirect");
    expect(classify("customer.example", "/api/owner/search")).toBe("reject");
    expect(classify("customer.example", "/api/internal/cleanup-expired-demos")).toBe("reject");
  });
});
