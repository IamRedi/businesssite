import { describe, expect, it } from "vitest";
import { informationMediaAccess } from "./information-media-access";

const platformHosts = new Set(["platform.example"]);

describe("information media access", () => {
  it("allows published media on the platform or its exact verified custom domain", () => {
    expect(informationMediaAccess({ host: "platform.example", platformHosts, customDomain: "news.example", customDomainVerified: true, publiclyAvailable: true, sameSiteAdmin: false })).toBe("public");
    expect(informationMediaAccess({ host: "news.example", platformHosts, customDomain: "news.example", customDomainVerified: true, publiclyAvailable: true, sameSiteAdmin: false })).toBe("public");
  });

  it("allows a same-site administrator to preview private media only on the platform host", () => {
    expect(informationMediaAccess({ host: "platform.example", platformHosts, customDomain: null, customDomainVerified: false, publiclyAvailable: false, sameSiteAdmin: true })).toBe("site-admin");
    expect(informationMediaAccess({ host: "news.example", platformHosts, customDomain: "news.example", customDomainVerified: true, publiclyAvailable: false, sameSiteAdmin: true })).toBe("deny");
  });

  it("denies draft media, cross-tenant mappings, inactive mappings and spoofed hosts", () => {
    expect(informationMediaAccess({ host: "news.example", platformHosts, customDomain: "news.example", customDomainVerified: true, publiclyAvailable: false, sameSiteAdmin: false })).toBe("deny");
    expect(informationMediaAccess({ host: "other.example", platformHosts, customDomain: "news.example", customDomainVerified: true, publiclyAvailable: true, sameSiteAdmin: false })).toBe("deny");
    expect(informationMediaAccess({ host: "news.example", platformHosts, customDomain: "news.example", customDomainVerified: false, publiclyAvailable: true, sameSiteAdmin: false })).toBe("deny");
    expect(informationMediaAccess({ host: "news.example,attacker.example", platformHosts, customDomain: "news.example", customDomainVerified: true, publiclyAvailable: true, sameSiteAdmin: false })).toBe("invalid-host");
  });
});
