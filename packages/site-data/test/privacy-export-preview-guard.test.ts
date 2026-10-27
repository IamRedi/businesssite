import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MemoryPrivacyArtifactStore } from "../src/privacy-export";
import { runPrivacyExportWorker } from "../src/privacy";

const repository = () => ({
  claimExport: vi.fn().mockResolvedValue(undefined),
  exportSnapshot: vi.fn(),
  reserveExport: vi.fn(),
  completeExport: vi.fn(),
  failExport: vi.fn(),
  markArtifactDeleted: vi.fn(),
  recoverStuckExports: vi.fn().mockResolvedValue(0),
});

const environment = {
  PRIVACY_EXPORT_ENABLED: "true",
  PRIVACY_EXPORT_ENCRYPTION_KEY_VERSION: "v1",
  PRIVACY_EXPORT_ENCRYPTION_KEYS: JSON.stringify({
    v1: randomBytes(32).toString("base64url"),
  }),
};

describe("privacy export Preview fixture guard", () => {
  it("allows deterministic memory execution in explicit isolated Preview", async () => {
    const repo = repository();
    await expect(runPrivacyExportWorker({
      repository: repo,
      store: new MemoryPrivacyArtifactStore("b6f1-staging"),
      workerReference: "b6f1-preview",
      environment: {
        ...environment,
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        RELEASE_TARGET: "staging",
      },
    })).resolves.toMatchObject({ enabled: true, claimed: false, completed: false });
    expect(repo.recoverStuckExports).toHaveBeenCalledOnce();
  });

  it("continues to reject memory execution in Vercel Production", async () => {
    await expect(runPrivacyExportWorker({
      repository: repository(),
      store: new MemoryPrivacyArtifactStore("production"),
      workerReference: "forbidden",
      environment: { ...environment, VERCEL_ENV: "production" },
    })).rejects.toThrow("private_store_required");
  });
});
