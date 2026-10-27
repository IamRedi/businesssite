import { describe, expect, it, vi } from "vitest";
import { authorizedSiteCapability } from "./product-access";

describe("customer product access", () => {
  it("requires exact site ownership and active entitlement", async () => {
    const repository = {
      getSiteIdBySlug: vi.fn().mockResolvedValue("site-a"),
      hasCapabilityAccess: vi.fn().mockResolvedValue(true),
    };
    await expect(authorizedSiteCapability(repository, { siteId: "site-a" }, "alpha", "media")).resolves.toBe("site-a");
    await expect(authorizedSiteCapability(repository, { siteId: "site-b" }, "alpha", "media")).resolves.toBeNull();
    repository.hasCapabilityAccess.mockResolvedValue(false);
    await expect(authorizedSiteCapability(repository, { siteId: "site-a" }, "alpha", "media")).resolves.toBeNull();
  });

  it("fails closed before repository authorization for inactive or unknown capabilities", async () => {
    const repository = {
      getSiteIdBySlug: vi.fn(),
      hasCapabilityAccess: vi.fn(),
    };
    await expect(authorizedSiteCapability(repository, { siteId: "site-a" }, "alpha", "social_media")).resolves.toBeNull();
    await expect(authorizedSiteCapability(repository, { siteId: "site-a" }, "alpha", "unknown" as never)).resolves.toBeNull();
    expect(repository.getSiteIdBySlug).not.toHaveBeenCalled();
  });
});
