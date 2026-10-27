import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const revoke = vi.fn();
vi.mock("@platform/site-data", () => ({ PostgresOwnerAuthRepository: class { revokeCurrentSession = revoke; } }));
import { POST } from "./route";

const origin = "https://platform.example";
function request(cookie?: string, requestOrigin = origin) {
  return new NextRequest(`${origin}/api/owner/auth/logout`, { method: "POST", headers: { origin: requestOrigin, "sec-fetch-site": requestOrigin === origin ? "same-origin" : "cross-site", ...(cookie ? { cookie } : {}) } });
}

describe("owner logout", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("PUBLIC_APP_URL", origin); revoke.mockResolvedValue(true); });

  it("revokes a canonical session server-side and clears both auth cookies", async () => {
    const response = await POST(request(`owner_session=${"a".repeat(64)}; owner_mfa_challenge=${"b".repeat(64)}`));
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(response.cookies.get("owner_session")?.maxAge).toBe(0);
    expect(response.cookies.get("owner_mfa_challenge")?.maxAge).toBe(0);
  });

  it("is idempotent without a cookie", async () => {
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(revoke).not.toHaveBeenCalled();
  });

  it("rejects cross-origin logout without clearing or revoking", async () => {
    const response = await POST(request(`owner_session=${"a".repeat(64)}`, "https://attacker.example"));
    expect(response.status).toBe(403);
    expect(revoke).not.toHaveBeenCalled();
  });

  it("fails closed when server-side revocation is unavailable", async () => {
    revoke.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(request(`owner_session=${"a".repeat(64)}`));
    expect(response.status).toBe(503);
    expect(response.cookies.get("owner_session")).toBeUndefined();
  });
});
