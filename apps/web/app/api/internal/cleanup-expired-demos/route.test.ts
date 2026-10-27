import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ constructed: vi.fn(), cleanup: vi.fn() }));
vi.mock("@platform/site-data", () => ({
  PostgresSiteRepository: class {
    constructor(input: unknown) { mocks.constructed(input); }
    deleteExpiredDemos = mocks.cleanup;
  },
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "c".repeat(32);
  process.env.DEMO_CLEANUP_EXECUTION_ENABLED = "true";
  mocks.cleanup.mockResolvedValue({ deletedSites: 0, deletedPreviews: 0, deletedRateLimits: 0, batch: 100 });
});

describe("expired demo cleanup route", () => {
  it("does not construct or open the system boundary for an invalid secret", async () => {
    const response = await GET(new Request("https://platform.example/api/internal/cleanup-expired-demos"));
    expect(response.status).toBe(401);
    expect(mocks.constructed).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("uses the constrained system boundary only after exact secret verification", async () => {
    const response = await GET(new Request("https://platform.example/api/internal/cleanup-expired-demos", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }));
    expect(response.status).toBe(200);
    expect(mocks.constructed).toHaveBeenCalledWith({ boundary: "system" });
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
  });

  it("fails closed without opening the system boundary when the master gate is off", async () => {
    process.env.DEMO_CLEANUP_EXECUTION_ENABLED = "false";
    const response = await GET(new Request("https://platform.example/api/internal/cleanup-expired-demos", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }));
    expect(response.status).toBe(503);
    expect(mocks.constructed).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
});
