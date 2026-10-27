import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumePasswordReset: vi.fn(),
  createAdminSession: vi.fn(),
  enforceSubjectRateLimit: vi.fn(),
  passwordHash: vi.fn(),
  tokenHash: vi.fn(),
}));

vi.mock("@platform/site-data", () => ({
  PostgresSiteRepository: class {
    consumePasswordReset = mocks.consumePasswordReset;
    createAdminSession = mocks.createAdminSession;
  },
}));
vi.mock("../../../../lib/rate-limit", () => ({
  clientAddress: () => "127.0.0.1",
  enforceSubjectRateLimit: mocks.enforceSubjectRateLimit,
}));
vi.mock("../../../../lib/site-admin-auth", () => ({
  passwordHash: mocks.passwordHash,
  SITE_ADMIN_SESSION_COOKIE: "site_admin_session",
  siteAdminSessionCookieOptions: (maxAge: number) => ({ httpOnly: true, sameSite: "strict", path: "/", maxAge }),
  tokenHash: mocks.tokenHash,
  validSiteAdminToken: (value: string | undefined) => Boolean(value && /^[a-f0-9]{64}$/.test(value)),
}));

import { POST } from "./route";

const token = "a".repeat(64);
function request(resetToken = token, password = "new-password-long-enough", origin = "https://platform.example") {
  return new Request("https://platform.example/api/site-admin/reset-password", {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": origin === "https://platform.example" ? "same-origin" : "cross-site",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token: resetToken, password }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_APP_URL = "https://platform.example";
  mocks.enforceSubjectRateLimit.mockResolvedValue({ allowed: true });
  mocks.passwordHash.mockResolvedValue("new-password-hash");
  mocks.tokenHash.mockReturnValue("reset-fingerprint");
  mocks.consumePasswordReset.mockResolvedValue(true);
});

describe("site-admin password reset", () => {
  it("hashes the reset token before atomic consumption", async () => {
    await POST(request());
    expect(mocks.tokenHash).toHaveBeenCalledWith(token);
    expect(mocks.consumePasswordReset).toHaveBeenCalledWith("reset-fingerprint", "new-password-hash");
  });

  it("uses one generic response for malformed, expired and already-used tokens", async () => {
    const malformed = await POST(request("malformed"));
    mocks.consumePasswordReset.mockResolvedValue(false);
    const expired = await POST(request());
    const used = await POST(request("b".repeat(64)));
    expect(malformed.status).toBe(303);
    expect(malformed.headers.get("location")).toBe(expired.headers.get("location"));
    expect(expired.headers.get("location")).toBe(used.headers.get("location"));
    expect(used.headers.get("location")).toBe("https://platform.example/site-admin/forgot-password?expired=1");
  });

  it("does not echo the raw reset token in success or failure redirects", async () => {
    const success = await POST(request());
    mocks.consumePasswordReset.mockResolvedValue(false);
    const failure = await POST(request());
    expect(success.headers.get("location")).not.toContain(token);
    expect(failure.headers.get("location")).not.toContain(token);
  });

  it("does not create a new session and redirects to login after success", async () => {
    const response = await POST(request());
    expect(response.headers.get("location")).toBe("https://platform.example/site-admin/login?reset=1");
    expect(mocks.createAdminSession).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects expired or revoked reset outcomes without clearing unrelated browser state", async () => {
    mocks.consumePasswordReset.mockResolvedValue(false);
    const response = await POST(request());
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns a generic rejection when rate limited", async () => {
    mocks.enforceSubjectRateLimit.mockResolvedValue({ allowed: false });
    const response = await POST(request());
    expect(response.headers.get("location")).toContain("expired=1");
    expect(mocks.consumePasswordReset).not.toHaveBeenCalled();
  });

  it("rejects cross-origin reset mutations before token processing", async () => {
    const response = await POST(request(undefined, undefined, "https://attacker.example"));
    expect(response.status).toBe(403);
    expect(mocks.tokenHash).not.toHaveBeenCalled();
  });
});
