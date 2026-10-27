import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const scopedQuery = vi.fn();
  const poolQuery = vi.fn();
  const release = vi.fn();
  const pool = { query: poolQuery, connect: vi.fn(async () => ({ query: scopedQuery, release })) };
  const withAuthenticatedSiteAdminContext = vi.fn(async (_pool, _sessionHash, callback) =>
    callback({ query: scopedQuery }, { siteId: "11111111-1111-4111-8111-111111111111" }));
  return { scopedQuery, poolQuery, pool, release, withAuthenticatedSiteAdminContext };
});

vi.mock("@platform/database", () => ({
  databaseRlsMode: () => "pilot",
  getPostgresPool: () => mocks.pool,
  getRuntimePostgresPool: () => mocks.pool,
  withAuthenticatedSiteAdminContext: mocks.withAuthenticatedSiteAdminContext,
}));

import { PostgresInformationRepository, PostgresSiteRepository } from "../src/index";

describe("pilot repository routing", () => {
  const siteId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    mocks.scopedQuery.mockReset();
    mocks.poolQuery.mockReset();
    mocks.pool.connect.mockClear();
    mocks.release.mockClear();
    mocks.withAuthenticatedSiteAdminContext.mockClear();
  });

  it("routes the Information ad-slot read through a DB-verified site-admin session", async () => {
    mocks.scopedQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ account_id: "account-a" }] })
      .mockResolvedValueOnce({ rows: [{ site_kind: "information" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await new PostgresInformationRepository({ boundary: "site_admin", sessionHash: "trusted-session-hash" }).listAdSlotsForSiteAdmin(siteId);
    expect(mocks.scopedQuery).toHaveBeenCalledWith(
      expect.stringContaining("information_editorial_install_context"),
      ["trusted-session-hash", siteId],
    );
    expect(mocks.scopedQuery).toHaveBeenCalledWith(expect.stringContaining("from site_information_ad_slots"), [siteId]);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("routes a customer capability lookup through authenticated session authority", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [{ allowed: true }] });
    await expect(new PostgresSiteRepository({ boundary: "site_admin", sessionHash: "trusted-session-hash" }).hasCapabilityAccess(siteId, "website")).resolves.toBe(true);
    expect(mocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("site_admin_capability_allowed"),
      ["trusted-session-hash", siteId, "website"],
    );
    expect(mocks.withAuthenticatedSiteAdminContext).not.toHaveBeenCalled();
  });

  it("resolves the login destination inside a verified site-admin context", async () => {
    mocks.scopedQuery
      .mockResolvedValueOnce({ rows: [{ available: true }] })
      .mockResolvedValueOnce({ rows: [{ slug: "information-site" }] });
    const repository = new PostgresSiteRepository({ boundary: "runtime" });
    await expect(repository.getSiteAdminLoginSlug("new-session-hash")).resolves.toBe("information-site");
    expect(mocks.withAuthenticatedSiteAdminContext).toHaveBeenCalledWith(
      mocks.pool,
      "new-session-hash",
      expect.any(Function),
      { expectedSiteId: undefined, requestId: undefined },
    );
    expect(mocks.scopedQuery).toHaveBeenCalledWith("select site_admin_site_available() as available");
    expect(mocks.scopedQuery).toHaveBeenCalledWith("select slug from sites where id=$1", [siteId]);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("does not read the site slug when scoped availability is denied", async () => {
    mocks.scopedQuery.mockResolvedValueOnce({ rows: [{ available: false }] });
    const repository = new PostgresSiteRepository({ boundary: "runtime" });
    await expect(repository.getSiteAdminLoginSlug("new-session-hash")).resolves.toBeNull();
    expect(mocks.scopedQuery).toHaveBeenCalledTimes(1);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });
});
