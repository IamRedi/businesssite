import { describe, expect, it } from "vitest";
import {
  normalizePublicSiteIdentity,
  publicSiteCacheTag,
} from "./public-site-cache-identity";

describe("public site cache identity", () => {
  it("keeps tenant slug and domain identities separate", () => {
    const tenantA = publicSiteCacheTag({ kind: "slug", value: "tenant-a" });
    const tenantB = publicSiteCacheTag({ kind: "slug", value: "tenant-b" });
    const domainA = publicSiteCacheTag({ kind: "domain", value: "tenant-a.example" });
    expect(tenantA).toBeTruthy();
    expect(new Set([tenantA, tenantB, domainA]).size).toBe(3);
  });

  it("canonicalizes domains and rejects ambiguous identities", () => {
    expect(
      normalizePublicSiteIdentity({
        kind: "domain",
        value: " WWW.Example.COM ",
      }),
    ).toEqual({ kind: "domain", value: "example.com" });
    expect(
      normalizePublicSiteIdentity({ kind: "slug", value: "../tenant" }),
    ).toBeNull();
    expect(
      normalizePublicSiteIdentity({ kind: "domain", value: "localhost" }),
    ).toBeNull();
    expect(
      normalizePublicSiteIdentity({ kind: "domain", value: "news.xn--bcher-kva" }),
    ).toEqual({ kind: "domain", value: "news.xn--bcher-kva" });
  });
});
