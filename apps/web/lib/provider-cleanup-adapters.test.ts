import { describe, expect, it, vi } from "vitest";
import { BlobNotFoundError } from "@vercel/blob";
import { PlatformProviderCleanupAdapter, vercelBlobCommandOptions, vercelDomainProjectAuthority } from "./provider-cleanup-adapters";

const projectId = "prj_ExampleProject0000000000";
const teamId = "team_1a2b3c4d5e6f7g8h9i0j1k2l";
const domainAuthority = vercelDomainProjectAuthority(teamId, projectId)!;
const domainEnvironment = {
  VERCEL_TOKEN: "synthetic-token",
  PRIVACY_PROVIDER_VERCEL_DOMAINS_PROJECT_ID: projectId,
  PRIVACY_PROVIDER_VERCEL_DOMAINS_TEAM_ID: teamId,
};

const work = (overrides = {}) => ({
  id: "11111111-1111-4111-8111-111111111111", jobId: "job", siteId: "site-a",
  provider: "vercel_blob" as const, sourceKind: "media", resourceKind: "blob_object",
  operation: "delete_exact" as const, providerReference: "sites/site-a/a.webp",
  providerAuthority: "store_ExampleStore0001",
  referenceHash: "a".repeat(64), attempt: 1, maxAttempts: 5, reconcile: false,
  ...overrides,
});
describe("BusinessSite provider cleanup adapters", () => {
  it("blocks malformed or cross-tenant Blob paths before transport", async () => {
    const blob = { del: vi.fn(), head: vi.fn() };
    const adapter = new PlatformProviderCleanupAdapter({ BLOB_READ_WRITE_TOKEN: "synthetic" }, blob as never);
    await expect(adapter.execute(work({ providerReference: "sites/site-b/a.webp" }))).resolves.toEqual({ outcome: "blocked", reasonCode: "blob_binding_invalid" });
    expect(blob.del).not.toHaveBeenCalled();
  });
  it("binds OIDC execution to the exact configured store authority", async () => {
    const environment = {
      VERCEL_OIDC_TOKEN: "synthetic-oidc",
      BLOB_STORE_ID: "store_ExampleStore0001",
      PRIVACY_PROVIDER_VERCEL_BLOB_STORE_ID: "store_ExampleStore0001",
    };
    const head = vi.fn()
      .mockResolvedValueOnce({ pathname: "sites/site-a/a.webp", url: "https://examplestore0001.public.blob.vercel-storage.com/sites/site-a/a.webp", etag: '"etag"' })
      .mockRejectedValueOnce(new BlobNotFoundError());
    const del = vi.fn().mockResolvedValue(undefined);
    const adapter = new PlatformProviderCleanupAdapter(environment, { del, head } as never);
    await expect(adapter.execute(work())).resolves.toMatchObject({ outcome: "completed" });
    expect(del).toHaveBeenCalledWith("sites/site-a/a.webp", expect.objectContaining({ storeId: "store_ExampleStore0001", oidcToken: "synthetic-oidc", ifMatch: '"etag"' }));
    expect(vercelBlobCommandOptions(environment, "store_KZTiY4mQqmSqD0wx")).toBeNull();
  });
  it("delegates runtime OIDC resolution to the Blob SDK on Vercel Functions", async () => {
    const environment = {
      VERCEL: "1",
      BLOB_STORE_ID: "store_ExampleStore0001",
      PRIVACY_PROVIDER_VERCEL_BLOB_STORE_ID: "store_ExampleStore0001",
    };
    const head = vi.fn()
      .mockResolvedValueOnce({ pathname: "sites/site-a/a.webp", url: "https://examplestore0001.public.blob.vercel-storage.com/sites/site-a/a.webp", etag: '"etag"' })
      .mockRejectedValueOnce(new BlobNotFoundError());
    const del = vi.fn().mockResolvedValue(undefined);
    const adapter = new PlatformProviderCleanupAdapter(environment, { del, head } as never);
    await expect(adapter.execute(work())).resolves.toMatchObject({ outcome: "completed" });
    expect(del).toHaveBeenCalledWith("sites/site-a/a.webp", {
      storeId: "store_ExampleStore0001",
      ifMatch: '"etag"',
    });
    expect(vercelBlobCommandOptions(environment, "store_KZTiY4mQqmSqD0wx")).toBeNull();
  });
  it("refuses a cross-store binding before Blob transport", async () => {
    const blob = { del: vi.fn(), head: vi.fn() };
    const adapter = new PlatformProviderCleanupAdapter({
      VERCEL_OIDC_TOKEN: "synthetic-oidc", BLOB_STORE_ID: "store_ExampleStore0001",
      PRIVACY_PROVIDER_VERCEL_BLOB_STORE_ID: "store_ExampleStore0001",
    }, blob as never);
    await expect(adapter.execute(work({ providerAuthority: "store_KZTiY4mQqmSqD0wx" }))).resolves.toMatchObject({ outcome: "blocked", reasonCode: "blob_authority_mismatch" });
    expect(blob.del).not.toHaveBeenCalled();
    expect(blob.head).not.toHaveBeenCalled();
  });
  it("classifies stateless and retained providers without network calls", async () => {
    const request = vi.fn();
    const adapter = new PlatformProviderCleanupAdapter({}, { del: vi.fn(), head: vi.fn() } as never, request);
    await expect(adapter.execute(work({ provider: "stripe", resourceKind: "subscription_retained", operation: "retain", providerReference: "sub_test" }))).resolves.toMatchObject({ outcome: "retained_by_policy" });
    await expect(adapter.execute(work({ provider: "openai", resourceKind: "stateless_ai_no_customer_object", operation: "retain", providerReference: "site-a:stateless" }))).resolves.toMatchObject({ outcome: "no_provider_object" });
    expect(request).not.toHaveBeenCalled();
  });
  it("keeps Paddle and REDI fail-closed until their cleanup contracts are accepted", async () => {
    const adapter = new PlatformProviderCleanupAdapter();
    await expect(adapter.execute(work({ provider: "paddle", operation: "delete_exact", resourceKind: "subscription_retained" }))).resolves.toMatchObject({ outcome: "unsupported" });
    await expect(adapter.execute(work({ provider: "redi_control", operation: "detach_exact", resourceKind: "redi_workspace" }))).resolves.toMatchObject({ outcome: "manual_review_required" });
  });
  it("detaches and independently reinspects only the bound project-domain attachment", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "b5b.example.test", projectId }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "b5b.example.test" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "not_found" } }), { status: 404 }));
    const adapter = new PlatformProviderCleanupAdapter(domainEnvironment, { del: vi.fn(), head: vi.fn() } as never, request);
    await expect(adapter.execute(work({
      provider: "vercel_domains", sourceKind: "domain", resourceKind: "project_domain_attachment",
      operation: "detach_exact", providerAuthority: domainAuthority, providerReference: "b5b.example.test",
    }))).resolves.toMatchObject({ outcome: "detached", reasonCode: "domain_detachment_verified" });
    expect(request).toHaveBeenCalledTimes(3);
    for (const [url] of request.mock.calls) {
      expect(String(url)).toBe(`https://api.vercel.com/v9/projects/${projectId}/domains/b5b.example.test?teamId=${teamId}`);
      expect(String(url)).not.toContain("/v6/domains/");
    }
    expect(request.mock.calls[1]?.[1]).toMatchObject({ method: "DELETE" });
  });
  it("converges already-detached work without a destructive request", async () => {
    const request = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
    const adapter = new PlatformProviderCleanupAdapter(domainEnvironment, { del: vi.fn(), head: vi.fn() } as never, request);
    await expect(adapter.execute(work({
      provider: "vercel_domains", sourceKind: "domain", resourceKind: "project_domain_attachment",
      operation: "detach_exact", providerAuthority: domainAuthority, providerReference: "absent.example.test",
    }))).resolves.toMatchObject({ outcome: "already_absent" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[1]?.method).toBeUndefined();
  });
  it("refuses missing and wrong-project domain authority before transport", async () => {
    const request = vi.fn();
    const adapter = new PlatformProviderCleanupAdapter(domainEnvironment, { del: vi.fn(), head: vi.fn() } as never, request);
    const base = {
      provider: "vercel_domains", sourceKind: "domain", resourceKind: "project_domain_attachment",
      operation: "detach_exact", providerReference: "b5b.example.test",
    };
    await expect(adapter.execute(work({ ...base, providerAuthority: undefined }))).resolves.toMatchObject({ outcome: "blocked", reasonCode: "domain_authority_invalid" });
    await expect(adapter.execute(work({ ...base, providerAuthority: vercelDomainProjectAuthority(teamId, "prj_000000000000000000000000") }))).resolves.toMatchObject({ outcome: "blocked", reasonCode: "domain_authority_mismatch" });
    expect(request).not.toHaveBeenCalled();
  });
  it("blocks a mismatched provider attachment and classifies retry/uncertain responses", async () => {
    const mismatch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "b5b.example.test", projectId: "prj_000000000000000000000000" }), { status: 200 }));
    const base = work({
      provider: "vercel_domains", sourceKind: "domain", resourceKind: "project_domain_attachment",
      operation: "detach_exact", providerAuthority: domainAuthority, providerReference: "b5b.example.test",
    });
    await expect(new PlatformProviderCleanupAdapter(domainEnvironment, { del: vi.fn(), head: vi.fn() } as never, mismatch).execute(base))
      .resolves.toMatchObject({ outcome: "blocked", reasonCode: "domain_project_binding_mismatch" });
    expect(mismatch).toHaveBeenCalledTimes(1);

    const rateLimited = vi.fn().mockResolvedValue(new Response("{}", { status: 429, headers: { "retry-after": "120" } }));
    await expect(new PlatformProviderCleanupAdapter(domainEnvironment, { del: vi.fn(), head: vi.fn() } as never, rateLimited).execute(base))
      .resolves.toMatchObject({ outcome: "retryable_failure", retryAfterSeconds: 120 });
    const uncertain = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(new PlatformProviderCleanupAdapter(domainEnvironment, { del: vi.fn(), head: vi.fn() } as never, uncertain).execute(base))
      .resolves.toMatchObject({ outcome: "uncertain", reasonCode: "domain_transport_uncertain" });
  });
});
