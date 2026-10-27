import { describe, expect, it, vi } from "vitest";
import {
  DeterministicFakeProviderCleanupAdapter,
  providerCleanupProviderEnabled,
  providerCleanupWorkerEnabled,
  runProviderCleanupDeletionWorker,
  type ProviderCleanupWork,
} from "../src/provider-cleanup";

const work: ProviderCleanupWork = {
  id: "item", jobId: "job", siteId: "site-a", provider: "vercel_blob",
  sourceKind: "media", resourceKind: "blob_object", operation: "delete_exact",
  providerReference: "sites/site-a/media.webp", referenceHash: "a".repeat(64),
  attempt: 1, maxAttempts: 5, reconcile: false,
};
const repository = () => ({
  recoverCustomerDeletions: vi.fn().mockResolvedValue(0),
  claimDeletionPlan: vi.fn().mockResolvedValue(undefined),
  planCustomerDeletion: vi.fn(),
  claimProviderCleanupWork: vi.fn().mockResolvedValue(undefined),
  recordProviderCleanupResult: vi.fn().mockResolvedValue(true),
  claimDeletionExecution: vi.fn().mockResolvedValue(undefined),
  executeCustomerDeletion: vi.fn(),
  failCustomerDeletion: vi.fn(),
});
const environment = {
  NODE_ENV: "test",
  PRIVACY_DELETION_EXECUTION_ENABLED: "true",
  PRIVACY_PROVIDER_CLEANUP_WORKER_ENABLED: "true",
  PRIVACY_PROVIDER_VERCEL_BLOB_ENABLED: "true",
  PRIVACY_PROVIDER_RECONCILIATION_ENABLED: "true",
};
describe("provider cleanup contract", () => {
  it("defaults every provider flag off", () => {
    expect(providerCleanupWorkerEnabled({})).toBe(false);
    expect(providerCleanupProviderEnabled("vercel_blob", environment)).toBe(true);
    expect(providerCleanupProviderEnabled("stripe", environment)).toBe(false);
  });
  it("does no database or transport work while disabled", async () => {
    const repo = repository(), adapter = { execute: vi.fn(), reconcile: vi.fn() };
    await expect(runProviderCleanupDeletionWorker({ repository: repo, adapter, workerReference: "worker", environment: {} }))
      .resolves.toEqual({ enabled: false, action: "none" });
    expect(repo.recoverCustomerDeletions).not.toHaveBeenCalled();
    expect(adapter.execute).not.toHaveBeenCalled();
  });
  it("records a verified result once for exact claimed work", async () => {
    const repo = repository(); repo.claimProviderCleanupWork.mockResolvedValue(work);
    const adapter = new DeterministicFakeProviderCleanupAdapter({}, environment);
    await expect(runProviderCleanupDeletionWorker({ repository: repo, adapter, workerReference: "worker", environment }))
      .resolves.toMatchObject({ enabled: true, action: "provider", outcome: "completed" });
    expect(repo.recordProviderCleanupResult).toHaveBeenCalledWith(expect.objectContaining({ id: "item", outcome: "completed", reasonCode: "fake_verified" }));
  });
  it("classifies non-destructive retention while unrelated provider flags stay off", async () => {
    const repo = repository();
    repo.claimProviderCleanupWork.mockResolvedValue({
      ...work,
      provider: "stripe",
      sourceKind: "subscription",
      resourceKind: "subscription_retained",
      operation: "retain",
      providerReference: "sub_synthetic",
    });
    const adapter = {
      execute: vi.fn().mockResolvedValue({
        outcome: "retained_by_policy",
        reasonCode: "financial_evidence_retained",
      }),
      reconcile: vi.fn(),
    };
    await expect(runProviderCleanupDeletionWorker({ repository: repo, adapter, workerReference: "worker", environment }))
      .resolves.toMatchObject({ enabled: true, action: "provider", outcome: "retained_by_policy" });
    expect(adapter.execute).toHaveBeenCalledOnce();
    expect(repo.recordProviderCleanupResult).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "retained_by_policy",
      reasonCode: "financial_evidence_retained",
    }));
  });
  it("fails closed when the leased result cannot be persisted", async () => {
    const repo = repository(); repo.claimProviderCleanupWork.mockResolvedValue(work);
    repo.recordProviderCleanupResult.mockResolvedValue(false);
    const adapter = new DeterministicFakeProviderCleanupAdapter({}, environment);
    await expect(runProviderCleanupDeletionWorker({ repository: repo, adapter, workerReference: "worker", environment }))
      .rejects.toThrow("provider_cleanup_result_not_recorded");
  });
  it("requires reconciliation enablement before an uncertain retry", async () => {
    const repo = repository(); repo.claimProviderCleanupWork.mockResolvedValue({ ...work, reconcile: true });
    const adapter = { execute: vi.fn(), reconcile: vi.fn() };
    await runProviderCleanupDeletionWorker({ repository: repo, adapter, workerReference: "worker", environment: { ...environment, PRIVACY_PROVIDER_RECONCILIATION_ENABLED: "false" } });
    expect(adapter.reconcile).not.toHaveBeenCalled();
    expect(repo.recordProviderCleanupResult).toHaveBeenCalledWith(expect.objectContaining({ outcome: "manual_review_required", reasonCode: "reconciliation_disabled" }));
  });
  it("rejects fake adapters in production", () => {
    expect(() => new DeterministicFakeProviderCleanupAdapter({}, { NODE_ENV: "production" })).toThrow(/forbidden/);
    expect(() => new DeterministicFakeProviderCleanupAdapter({}, { VERCEL_ENV: "production" })).toThrow(/forbidden/);
  });
  it("permits deterministic fixtures in an explicit isolated Preview", () => {
    expect(() => new DeterministicFakeProviderCleanupAdapter({}, {
      NODE_ENV: "production", VERCEL_ENV: "preview", RELEASE_TARGET: "staging",
    })).not.toThrow();
  });
});
