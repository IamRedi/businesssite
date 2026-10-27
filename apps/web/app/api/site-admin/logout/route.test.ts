import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  revokeAdminSession: vi.fn(),
  tokenHash: vi.fn(),
}));

vi.mock("@platform/site-data", () => ({
  PostgresSiteRepository: class {
    revokeAdminSession = mocks.revokeAdminSession;
  },
}));
vi.mock("../../../../lib/site-admin-auth", () => ({
  SITE_ADMIN_SESSION_COOKIE: "site_admin_session",
  siteAdminSessionCookieOptions: (maxAge: number) => ({ httpOnly: true, sameSite: "strict", path: "/", maxAge }),
  tokenHash: mocks.tokenHash,
  validSiteAdminToken: (value: string | undefined) => Boolean(value && /^[a-f0-9]{64}$/.test(value)),
}));

import { POST } from "./route";

function request(cookie?: string, origin = "https://platform.example", body?: URLSearchParams) {
  return new NextRequest("https://platform.example/api/site-admin/logout", {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": origin === "https://platform.example" ? "same-origin" : "cross-site",
      ...(cookie ? { cookie: `site_admin_session=${cookie}` } : {}),
      ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_APP_URL = "https://platform.example";
  mocks.revokeAdminSession.mockResolvedValue(true);
  mocks.tokenHash.mockReturnValue("session-fingerprint");
});

describe("site-admin logout", () => {
  it("revokes the current session fingerprint server-side", async () => {
    const token = "a".repeat(64);
    const response = await POST(request(token));
    expect(mocks.tokenHash).toHaveBeenCalledWith(token);
    expect(mocks.revokeAdminSession).toHaveBeenCalledWith("session-fingerprint");
    expect(response.status).toBe(303);
  });

  it("clears the cookie with matching hardened scope", async () => {
    const response = await POST(request("a".repeat(64)));
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("site_admin_session=");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=strict");
  });

  it("is idempotent when no session cookie remains", async () => {
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://platform.example/site-admin/login");
    expect(mocks.revokeAdminSession).not.toHaveBeenCalled();
  });

  it("rejects malformed cookies without querying the database", async () => {
    const response = await POST(request("malformed"));
    expect(response.status).toBe(303);
    expect(mocks.revokeAdminSession).not.toHaveBeenCalled();
  });

  it("ignores attacker-supplied account and site identifiers", async () => {
    await POST(request("a".repeat(64), undefined, new URLSearchParams({ accountId: "victim", siteId: "site-b" })));
    expect(mocks.revokeAdminSession).toHaveBeenCalledTimes(1);
    expect(mocks.revokeAdminSession).toHaveBeenCalledWith("session-fingerprint");
  });

  it("rejects cross-origin logout before revocation", async () => {
    const response = await POST(request("a".repeat(64), "https://attacker.example"));
    expect(response.status).toBe(403);
    expect(mocks.revokeAdminSession).not.toHaveBeenCalled();
  });

  it("does not clear the browser cookie if database revocation fails", async () => {
    mocks.revokeAdminSession.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(request("a".repeat(64)));
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toEqual({ error: "Logout is temporarily unavailable." });
  });
});
