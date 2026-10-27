import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminByEmail: vi.fn(),
  createPasswordReset: vi.fn(),
  enforceSubjectRateLimit: vi.fn(),
  sendPasswordReset: vi.fn(),
  tokenHash: vi.fn(),
}));

vi.mock("@platform/site-data", () => ({
  PostgresSiteRepository: class {
    getAdminByEmail = mocks.getAdminByEmail;
    createPasswordReset = mocks.createPasswordReset;
  },
}));
vi.mock("../../../../lib/rate-limit", () => ({
  clientAddress: () => "127.0.0.1",
  enforceSubjectRateLimit: mocks.enforceSubjectRateLimit,
}));
vi.mock("../../../../lib/email", () => ({ sendPasswordReset: mocks.sendPasswordReset }));
vi.mock("../../../../lib/site-admin-auth", () => ({
  normalizeSiteAdminEmail: (value: unknown) => String(value ?? "").trim().toLowerCase(),
  tokenHash: mocks.tokenHash,
}));

import { POST } from "./route";

function request(email: string, origin = "https://platform.example") {
  return new Request("https://platform.example/api/site-admin/recovery", {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": origin === "https://platform.example" ? "same-origin" : "cross-site",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ email }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_APP_URL = "https://platform.example";
  mocks.enforceSubjectRateLimit.mockResolvedValue({ allowed: true });
  mocks.getAdminByEmail.mockResolvedValue({ id: "account-1", email: "owner@example.test" });
  mocks.createPasswordReset.mockResolvedValue(undefined);
  mocks.sendPasswordReset.mockResolvedValue({ status: "sent" });
  mocks.tokenHash.mockReturnValue("reset-fingerprint");
});

describe("site-admin recovery request", () => {
  it("returns the same public response for existing and missing accounts", async () => {
    const existing = await POST(request("owner@example.test"));
    mocks.getAdminByEmail.mockResolvedValueOnce(null);
    const missing = await POST(request("missing@example.test"));
    expect(existing.status).toBe(303);
    expect(existing.headers.get("location")).toBe(missing.headers.get("location"));
    expect(existing.headers.get("location")).toBe("https://platform.example/site-admin/forgot-password?sent=1");
  });

  it("does not create a token or send email for an unidentified account", async () => {
    mocks.getAdminByEmail.mockResolvedValue(null);
    await POST(request("missing@example.test"));
    expect(mocks.createPasswordReset).not.toHaveBeenCalled();
    expect(mocks.sendPasswordReset).not.toHaveBeenCalled();
  });

  it("normalizes casing and whitespace before rate limiting and lookup", async () => {
    await POST(request("  Owner@Example.TEST  "));
    expect(mocks.getAdminByEmail).toHaveBeenCalledWith("owner@example.test");
    expect(mocks.enforceSubjectRateLimit).toHaveBeenCalledWith(
      "password_reset_account",
      "owner@example.test",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("keeps the public response identical when reset persistence or delivery fails", async () => {
    mocks.createPasswordReset.mockRejectedValue(new Error("provider-private-detail"));
    const response = await POST(request("owner@example.test"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://platform.example/site-admin/forgot-password?sent=1");
    expect(response.headers.get("location")).not.toContain("provider-private-detail");
  });

  it("returns the same public completion response when rate limited", async () => {
    mocks.enforceSubjectRateLimit.mockResolvedValue({ allowed: false });
    const response = await POST(request("owner@example.test"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("sent=1");
    expect(mocks.getAdminByEmail).not.toHaveBeenCalled();
  });

  it("rejects cross-origin recovery spam before account lookup", async () => {
    const response = await POST(request("owner@example.test", "https://attacker.example"));
    expect(response.status).toBe(403);
    expect(mocks.getAdminByEmail).not.toHaveBeenCalled();
  });
});
