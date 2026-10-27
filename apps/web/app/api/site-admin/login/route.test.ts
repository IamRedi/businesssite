import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminByEmail: vi.fn(),
  getSiteAdminLoginSlug: vi.fn(),
  revokeAdminSession: vi.fn(),
  enforceSubjectRateLimit: vi.fn(),
  passwordMatches: vi.fn(),
  rotateSiteAdminSession: vi.fn(),
}));

vi.mock("@platform/site-data", () => ({
  PostgresSiteRepository: class {
    getAdminByEmail = mocks.getAdminByEmail;
    getSiteAdminLoginSlug = mocks.getSiteAdminLoginSlug;
    revokeAdminSession = mocks.revokeAdminSession;
  },
}));
vi.mock("../../../../lib/rate-limit", () => ({
  clientAddress: () => "127.0.0.1",
  enforceSubjectRateLimit: mocks.enforceSubjectRateLimit,
}));
vi.mock("../../../../lib/site-admin-auth", () => ({
  DUMMY_PASSWORD_HASH: "dummy-hash",
  normalizeSiteAdminEmail: (value: unknown) => String(value ?? "").trim().toLowerCase(),
  passwordMatches: mocks.passwordMatches,
  rotateSiteAdminSession: mocks.rotateSiteAdminSession,
  SITE_ADMIN_SESSION_COOKIE: "site_admin_session",
  siteAdminSessionCookieOptions: () => ({ httpOnly: true, sameSite: "strict", path: "/", maxAge: 1209600 }),
  tokenHash: (token: string) => `hash:${token}`,
}));

import { POST } from "./route";

const account = {
  id: "account-1",
  siteId: "site-1",
  email: "owner@example.test",
  passwordHash: "stored-hash",
};

function request(email = "owner@example.test", password = "correct-password", headers: Record<string, string> = {}) {
  return new NextRequest("https://platform.example/api/site-admin/login", {
    method: "POST",
    headers: {
      origin: "https://platform.example",
      "sec-fetch-site": "same-origin",
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams({ email, password }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_APP_URL = "https://platform.example";
  mocks.enforceSubjectRateLimit.mockResolvedValue({ allowed: true });
  mocks.getAdminByEmail.mockResolvedValue(account);
  mocks.passwordMatches.mockResolvedValue(true);
  mocks.getSiteAdminLoginSlug.mockResolvedValue("business-slug");
  mocks.revokeAdminSession.mockResolvedValue(true);
  mocks.rotateSiteAdminSession.mockResolvedValue("b".repeat(64));
});

describe("site-admin login", () => {
  it("uses the same public failure for an unknown email and a wrong known password", async () => {
    mocks.getAdminByEmail.mockResolvedValueOnce(null);
    mocks.passwordMatches.mockResolvedValueOnce(false);
    const unknown = await POST(request("missing@example.test", "wrong-password"));
    mocks.getAdminByEmail.mockResolvedValueOnce(account);
    mocks.passwordMatches.mockResolvedValueOnce(false);
    const known = await POST(request("owner@example.test", "wrong-password"));
    expect(unknown.status).toBe(303);
    expect(known.status).toBe(303);
    expect(unknown.headers.get("location")).toBe(known.headers.get("location"));
    expect(unknown.headers.get("location")).toBe("https://platform.example/site-admin/login?error=invalid");
  });

  it("performs the password work with a dummy hash for an unknown account", async () => {
    mocks.getAdminByEmail.mockResolvedValue(null);
    mocks.passwordMatches.mockResolvedValue(false);
    await POST(request("missing@example.test", "wrong-password"));
    expect(mocks.passwordMatches).toHaveBeenCalledWith("wrong-password", "dummy-hash");
  });

  it("normalizes email before rate limiting and lookup", async () => {
    await POST(request("  Owner@Example.TEST  "));
    expect(mocks.enforceSubjectRateLimit).toHaveBeenCalledWith(
      "site_admin_login_account",
      "owner@example.test",
      expect.any(Number),
      expect.any(Number),
    );
    expect(mocks.getAdminByEmail).toHaveBeenCalledWith("owner@example.test");
  });

  it("rotates the prior session and sets a hardened replacement cookie", async () => {
    const previous = "a".repeat(64);
    const response = await POST(request(undefined, undefined, { cookie: `site_admin_session=${previous}` }));
    expect(mocks.rotateSiteAdminSession).toHaveBeenCalledWith(
      expect.anything(),
      "account-1",
      previous,
      undefined,
      "stored-hash",
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://platform.example/site-admin/business-slug");
    expect(mocks.getSiteAdminLoginSlug).toHaveBeenCalledWith(`hash:${"b".repeat(64)}`);
    expect(mocks.revokeAdminSession).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("site_admin_session=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=strict");
  });

  it("does not reveal an expired site's existence", async () => {
    mocks.getSiteAdminLoginSlug.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.headers.get("location")).toBe("https://platform.example/site-admin/login?error=invalid");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.revokeAdminSession).toHaveBeenCalledWith(`hash:${"b".repeat(64)}`);
  });

  it("revokes a newly created session if the scoped availability check fails", async () => {
    mocks.getSiteAdminLoginSlug.mockRejectedValue(new Error("database unavailable"));
    await expect(POST(request())).rejects.toThrow("database unavailable");
    expect(mocks.revokeAdminSession).toHaveBeenCalledWith(`hash:${"b".repeat(64)}`);
  });

  it("rejects cross-origin login mutations before account lookup", async () => {
    const response = await POST(request(undefined, undefined, { origin: "https://attacker.example" }));
    expect(response.status).toBe(403);
    expect(mocks.getAdminByEmail).not.toHaveBeenCalled();
  });
});
