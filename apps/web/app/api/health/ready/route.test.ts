import { afterEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ healthCheck: vi.fn() }));
vi.mock("@platform/site-data", () => ({
  PostgresSiteRepository: class {
    healthCheck = mock.healthCheck;
  },
}));
import { GET } from "./route";

describe("database readiness", () => {
  afterEach(() => { mock.healthCheck.mockReset(); });
  it("checks the database exactly once on demand", async () => {
    mock.healthCheck.mockResolvedValue(undefined);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "ok" });
    expect(mock.healthCheck).toHaveBeenCalledTimes(1);
  });
  it("returns 503 without leaking connection details", async () => {
    mock.healthCheck.mockRejectedValue(new Error("postgresql://secret@localhost"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await GET();
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        status: "degraded", database: "unavailable",
      });
      expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain("secret@localhost");
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
