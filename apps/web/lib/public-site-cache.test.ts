import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheMocks = vi.hoisted(() => ({
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  getSlugBySiteId: vi.fn(),
  getSiteAccess: vi.fn(),
  getPublicBySlug: vi.fn(),
  getByVerifiedCustomDomain: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: vi.fn((callback: () => unknown) => callback),
  updateTag: cacheMocks.updateTag,
  revalidatePath: cacheMocks.revalidatePath,
  revalidateTag: cacheMocks.revalidateTag,
}));
vi.mock("@platform/site-data", () => ({ PostgresSiteRepository: class {
  getSlugBySiteId = cacheMocks.getSlugBySiteId;
  getSiteAccess = cacheMocks.getSiteAccess;
  getPublicBySlug = cacheMocks.getPublicBySlug;
  getByVerifiedCustomDomain = cacheMocks.getByVerifiedCustomDomain;
} }));

import {
  expirePublicSiteAfterMutation,
  expirePublicSiteAfterMutationById,
  expirePublicSiteFromRoute,
  getCachedPublicSiteByDomain,
  getCachedPublicSiteBySlug,
  invalidatePublicSite,
} from "./public-site-cache";

describe("public site cache invalidation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expires the exact tenant tag and public path after a server mutation", () => {
    expirePublicSiteAfterMutation({ kind: "slug", value: "Daily-Signal" });
    expect(cacheMocks.updateTag).toHaveBeenCalledOnce();
    expect(cacheMocks.updateTag.mock.calls[0][0]).toMatch(/^public-site:slug:/);
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/site/daily-signal");
  });

  it("uses stale-while-revalidate invalidation outside server actions", () => {
    invalidatePublicSite({ kind: "slug", value: "daily-signal" });
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(expect.stringMatching(/^public-site:slug:/), "max");
  });

  it("expires only the exact customer identity on route Save without serving stale content", () => {
    expirePublicSiteFromRoute({ kind: "slug", value: "Daily-Signal" });
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(expect.stringMatching(/^public-site:slug:/), { expire: 0 });
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/site/daily-signal");
    cacheMocks.revalidateTag.mockClear();
    cacheMocks.revalidatePath.mockClear();
    expirePublicSiteFromRoute({ kind: "domain", value: "news.example" });
    expect(cacheMocks.revalidateTag).toHaveBeenCalledOnce();
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(expect.stringMatching(/^public-site:domain:/), { expire: 0 });
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
    expect(cacheMocks.updateTag).not.toHaveBeenCalled();
  });

  it("expires both slug and verified domain identities after an editorial mutation", async () => {
    const repository = { getActorCacheIdentities: vi.fn().mockResolvedValue({ slug: "daily-signal", customDomain: "news.example" }) } as never;
    await expirePublicSiteAfterMutationById(repository, "site-1");
    expect(cacheMocks.updateTag.mock.calls.map(([tag]) => tag)).toEqual([
      expect.stringMatching(/^public-site:slug:/),
      expect.stringMatching(/^public-site:domain:/),
    ]);
    expect(cacheMocks.revalidatePath).toHaveBeenCalledTimes(1);
  });

  it("returns only the document approved by the public resolver boundary", async () => {
    const site = { id: "site-1", slug: "daily-signal" };
    cacheMocks.getPublicBySlug.mockResolvedValue(site);
    await expect(getCachedPublicSiteBySlug("daily-signal")).resolves.toEqual(site);
    expect(cacheMocks.getPublicBySlug).toHaveBeenCalledTimes(2);
  });

  it("fails closed when fresh resolver eligibility changes under cached content", async () => {
    cacheMocks.getPublicBySlug
      .mockResolvedValueOnce({ id: "site-1", slug: "daily-signal" })
      .mockResolvedValueOnce(null);
    await expect(getCachedPublicSiteBySlug("daily-signal")).resolves.toBeNull();
  });

  it("uses the current tenant after a verified domain is reassigned", async () => {
    cacheMocks.getByVerifiedCustomDomain
      .mockResolvedValueOnce({ id: "old-tenant" })
      .mockResolvedValueOnce({ id: "new-tenant" });
    await expect(getCachedPublicSiteByDomain("NEWS.EXAMPLE")).resolves.toEqual({ id: "new-tenant" });
    expect(cacheMocks.getByVerifiedCustomDomain).toHaveBeenNthCalledWith(1, "news.example");
    expect(cacheMocks.getByVerifiedCustomDomain).toHaveBeenNthCalledWith(2, "news.example");
    expect(cacheMocks.getPublicBySlug).not.toHaveBeenCalled();
  });

  it("refuses a revoked domain even when its content was cached", async () => {
    cacheMocks.getByVerifiedCustomDomain
      .mockResolvedValueOnce({ id: "old-tenant" })
      .mockResolvedValueOnce(null);
    await expect(getCachedPublicSiteByDomain("news.example")).resolves.toBeNull();
  });
});
