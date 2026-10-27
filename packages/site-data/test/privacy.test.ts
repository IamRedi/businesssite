import { describe, expect, it, vi } from "vitest";
import {
  DeterministicFakeDeletionProviderAdapter,
  privacyDeletionExecutionEnabled,
  privacyRetentionExecutionEnabled,
  runCustomerDeletionWorker,
  runPrivacyRetentionScheduler,
} from "../src/privacy";

describe("privacy retention execution gate", () => {
  it("defaults off and executes zero database/provider work", async () => {
    const repository = {
      recoverStuckRetentionScans: vi.fn(),
      claimRetentionScan: vi.fn(),
      planRetentionScan: vi.fn(),
    };
    expect(privacyRetentionExecutionEnabled({})).toBe(false);
    await expect(
      runPrivacyRetentionScheduler({
        repository,
        workerReference: "test-worker",
        environment: {},
      }),
    ).resolves.toEqual({ enabled: false, claimed: false, planned: false });
    expect(repository.claimRetentionScan).not.toHaveBeenCalled();
    expect(repository.planRetentionScan).not.toHaveBeenCalled();
    expect(repository.recoverStuckRetentionScans).not.toHaveBeenCalled();
  });
  it("only claims and plans a retention scan when explicitly enabled", async () => {
    const repository = {
      recoverStuckRetentionScans: vi.fn().mockResolvedValue(0),
      claimRetentionScan: vi.fn().mockResolvedValue("job-id"),
      planRetentionScan: vi.fn().mockResolvedValue(true),
    };
    await expect(
      runPrivacyRetentionScheduler({
        repository,
        workerReference: "test-worker",
        environment: { PRIVACY_RETENTION_EXECUTION_ENABLED: "true" },
      }),
    ).resolves.toEqual({
      enabled: true,
      claimed: true,
      planned: true,
      jobId: "job-id",
    });
    expect(repository.claimRetentionScan).toHaveBeenCalledWith("test-worker");
    expect(repository.planRetentionScan).toHaveBeenCalledWith(
      "job-id",
      "test-worker",
    );
  });
});

describe("customer deletion execution gate", () => {
  const repository = () => ({
    recoverCustomerDeletions: vi.fn(),
    claimDeletionPlan: vi.fn(),
    planCustomerDeletion: vi.fn(),
    claimDeletionProviderItem: vi.fn(),
    finishDeletionProviderItem: vi.fn(),
    claimDeletionExecution: vi.fn(),
    executeCustomerDeletion: vi.fn(),
    failCustomerDeletion: vi.fn(),
  });
  it("defaults off with zero database and provider calls", async () => {
    const repo = repository(),
      provider = { cleanup: vi.fn() };
    expect(privacyDeletionExecutionEnabled({})).toBe(false);
    await expect(
      runCustomerDeletionWorker({
        repository: repo,
        provider,
        workerReference: "worker",
        environment: {},
      }),
    ).resolves.toEqual({ enabled: false, action: "none" });
    for (const fn of Object.values(repo)) expect(fn).not.toHaveBeenCalled();
    expect(provider.cleanup).not.toHaveBeenCalled();
  });
  it("uses only an injected deterministic provider item when enabled", async () => {
    const repo = repository();
    repo.recoverCustomerDeletions.mockResolvedValue(0);
    repo.claimDeletionPlan.mockResolvedValue(undefined);
    repo.claimDeletionProviderItem.mockResolvedValue({
      id: "item",
      jobId: "job",
      provider: "stripe",
      referenceHash: "a".repeat(64),
    });
    repo.finishDeletionProviderItem.mockResolvedValue(true);
    const provider = new DeterministicFakeDeletionProviderAdapter({
      NODE_ENV: "test",
    });
    await expect(
      runCustomerDeletionWorker({
        repository: repo,
        provider,
        workerReference: "worker",
        environment: { PRIVACY_DELETION_EXECUTION_ENABLED: "true" },
      }),
    ).resolves.toMatchObject({
      enabled: true,
      action: "provider",
      success: true,
    });
    expect(repo.finishDeletionProviderItem).toHaveBeenCalledWith(
      "item",
      "worker",
      true,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });
  it("rejects the fake adapter for production", () => {
    expect(
      () =>
        new DeterministicFakeDeletionProviderAdapter({
          NODE_ENV: "production",
        }),
    ).toThrow(/forbidden/);
  });
});
