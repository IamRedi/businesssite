import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSiteAdmin: vi.fn(),
  trustedSiteAdminSessionHash: vi.fn(),
  getEditorialRole: vi.fn(),
}));

vi.mock("./site-admin-auth", () => ({
  requireSiteAdmin: mocks.requireSiteAdmin,
  trustedSiteAdminSessionHash: mocks.trustedSiteAdminSessionHash,
}));
vi.mock("@platform/site-data", async (importOriginal) => {
  const original = await importOriginal<typeof import("@platform/site-data")>();
  return {
    ...original,
    PostgresInformationRepository: class {
      getEditorialRole = mocks.getEditorialRole;
    },
  };
});

import { getEditorialAccess, hasEditorialPermission } from "./editorial-auth";

describe("editorial authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trustedSiteAdminSessionHash.mockReturnValue("session-hash");
  });

  it("denies access without a valid site-admin session", async () => {
    mocks.requireSiteAdmin.mockResolvedValue(null);
    expect(await getEditorialAccess("publication")).toBeNull();
    expect(mocks.getEditorialRole).not.toHaveBeenCalled();
  });

  it("denies a valid tenant session without an editorial membership", async () => {
    mocks.requireSiteAdmin.mockResolvedValue({ accountId: "account-a", siteId: "site-a", email: "a@example.test" });
    mocks.getEditorialRole.mockResolvedValue(null);
    expect(await getEditorialAccess("publication")).toBeNull();
  });

  it("enforces the role permission on every requested operation", async () => {
    mocks.requireSiteAdmin.mockResolvedValue({ accountId: "account-a", siteId: "site-a", email: "a@example.test" });
    mocks.getEditorialRole.mockResolvedValue("editor");
    expect(await hasEditorialPermission("publication", "article:update")).toMatchObject({ role: "editor", siteId: "site-a" });
    expect(await hasEditorialPermission("publication", "article:publish")).toBeNull();
  });
});
