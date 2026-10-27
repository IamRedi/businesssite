import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSiteAdmin: vi.fn(),
  getAdminByEmail: vi.fn(),
  changeAdminPassword: vi.fn(),
  enforceSubjectRateLimit: vi.fn(),
  passwordMatches: vi.fn(),
  passwordHash: vi.fn(),
}));

vi.mock("@platform/site-data", () => ({
  PostgresSiteRepository: class {
    getAdminByEmail = mocks.getAdminByEmail;
    changeAdminPassword = mocks.changeAdminPassword;
  },
}));
vi.mock("../../../../../lib/rate-limit", () => ({
  clientAddress: () => "127.0.0.1",
  enforceSubjectRateLimit: mocks.enforceSubjectRateLimit,
}));
vi.mock("../../../../../lib/site-admin-auth", () => ({
  passwordHash: mocks.passwordHash,
  passwordMatches: mocks.passwordMatches,
  requireSiteAdmin: mocks.requireSiteAdmin,
  SITE_ADMIN_SESSION_COOKIE: "site_admin_session",
  siteAdminSessionCookieOptions: (maxAge: number) => ({ httpOnly: true, sameSite: "strict", path: "/", maxAge }),
  trustedSiteAdminSessionHash: () => "session-hash",
}));

import { POST } from "./route";

const session = { accountId: "account-1", siteId: "site-1", email: "owner@example.test" };
const account = { id: "account-1", siteId: "site-1", email: "owner@example.test", passwordHash: "old-hash" };
const context = { params: Promise.resolve({ slug: "business-slug" }) };

function request(
  currentPassword = "current-password",
  newPassword = "new-password-long-enough",
  origin = "https://platform.example",
) {
  return new Request("https://platform.example/api/site-admin/business-slug/password", {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": origin === "https://platform.example" ? "same-origin" : "cross-site",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ currentPassword, newPassword }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_APP_URL = "https://platform.example";
  mocks.requireSiteAdmin.mockResolvedValue(session);
  mocks.getAdminByEmail.mockResolvedValue(account);
  mocks.enforceSubjectRateLimit.mockResolvedValue({ allowed: true });
  mocks.passwordMatches.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  mocks.passwordHash.mockResolvedValue("new-hash");
  mocks.changeAdminPassword.mockResolvedValue(true);
});

describe("manual site-admin password change", () => {
  it("requires an authorized session bound to the route slug", async () => {
    mocks.requireSiteAdmin.mockResolvedValue(null);
    const response = await POST(request(), context);
    expect(response.status).toBe(403);
    expect(mocks.getAdminByEmail).not.toHaveBeenCalled();
  });

  it("requires the current password before changing the hash", async () => {
    mocks.passwordMatches.mockReset().mockResolvedValue(false);
    const response = await POST(request("wrong-password"), context);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("password=invalid");
    expect(mocks.passwordHash).not.toHaveBeenCalled();
    expect(mocks.changeAdminPassword).not.toHaveBeenCalled();
  });

  it("fails closed if the session account does not own the loaded site account", async () => {
    mocks.getAdminByEmail.mockResolvedValue({ ...account, id: "account-2" });
    const response = await POST(request(), context);
    expect(response.headers.get("location")).toContain("password=invalid");
    expect(mocks.passwordMatches).not.toHaveBeenCalled();
    expect(mocks.changeAdminPassword).not.toHaveBeenCalled();
  });

  it("atomically targets only the authenticated account and its current hash", async () => {
    const response = await POST(request(), context);
    expect(mocks.changeAdminPassword).toHaveBeenCalledWith("account-1", "old-hash", "new-hash", "session-hash");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://platform.example/site-admin/login?reset=1");
  });

  it("revokes the current browser state by clearing the cookie after success", async () => {
    const response = await POST(request(), context);
    expect(response.headers.get("set-cookie")).toContain("site_admin_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects reuse of the current password as the replacement", async () => {
    mocks.passwordMatches.mockReset().mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    await POST(request(), context);
    expect(mocks.passwordHash).not.toHaveBeenCalled();
    expect(mocks.changeAdminPassword).not.toHaveBeenCalled();
  });

  it("rejects cross-origin password changes before authorization", async () => {
    const response = await POST(request(undefined, undefined, "https://attacker.example"), context);
    expect(response.status).toBe(403);
    expect(mocks.requireSiteAdmin).not.toHaveBeenCalled();
  });

  it("uses a generic response when a concurrent password update wins", async () => {
    mocks.changeAdminPassword.mockResolvedValue(false);
    const response = await POST(request(), context);
    expect(response.headers.get("location")).toContain("password=invalid");
    expect(response.headers.get("location")).not.toContain("account-1");
  });
});
