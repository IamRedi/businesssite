import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSiteAdmin: vi.fn(),
  authorizedSiteCapability: vi.fn(),
  getSiteIdBySlug: vi.fn(),
}));

vi.mock("../../../../../../lib/ai-config", () => ({
  aiConfig: { clientEnabled: true },
  configuredAiProvider: vi.fn(),
}));
vi.mock("../../../../../../lib/site-admin-auth", () => ({ requireSiteAdmin: mocks.requireSiteAdmin, trustedSiteAdminSessionHash: () => "a".repeat(64) }));
vi.mock("../../../../../../lib/product-access", () => ({ authorizedSiteCapability: mocks.authorizedSiteCapability }));
vi.mock("@platform/site-data", () => ({
  PostgresSiteRepository: class { getSiteIdBySlug = mocks.getSiteIdBySlug; },
}));

import { POST } from "./route";

describe("client AI lifecycle gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSiteAdmin.mockResolvedValue({ accountId: "account-1", siteId: "site-1" });
    mocks.getSiteIdBySlug.mockResolvedValue("site-1");
    mocks.authorizedSiteCapability.mockResolvedValue(null);
  });

  it("rejects unavailable AI before parsing input or invoking a provider", async () => {
    const json = vi.fn();
    const response = await POST({ json } as unknown as Request, {
      params: Promise.resolve({ slug: "example" }),
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "AI assistance is unavailable for this subscription." });
    expect(json).not.toHaveBeenCalled();
  });
});
