import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const repository = { getOwnerByEmail: vi.fn(), recordAudit: vi.fn(), changePassword: vi.fn() };
const auth = vi.hoisted(() => ({
  requireOwnerSession: vi.fn(), ownerPasswordMatches: vi.fn(),
  decryptOwnerMfaSecret: vi.fn(), verifyOwnerTotp: vi.fn(), ownerPasswordHash: vi.fn(),
}));
vi.mock("@platform/site-data", () => ({ PostgresOwnerAuthRepository: class { constructor() { return repository; } } }));
vi.mock("../../../../../lib/rate-limit", () => ({ enforceSubjectRateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock("../../../../../lib/owner-auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../../lib/owner-auth")>();
  return { ...original, ...auth };
});
import { POST } from "./route";

const origin = "https://platform.example";
function request(values: Record<string, string>, requestOrigin = origin) {
  return new NextRequest(`${origin}/api/owner/auth/password`, {
    method: "POST", headers: { origin: requestOrigin, "sec-fetch-site": requestOrigin === origin ? "same-origin" : "cross-site", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
  });
}
const valid = { currentPassword: "current-password-123", newPassword: "new-password-456789", code: "123456" };

describe("owner password change", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("PUBLIC_APP_URL", origin);
    auth.requireOwnerSession.mockResolvedValue({ sessionId: "session-id", sessionHash: "a".repeat(64), ownerId: "owner-id", email: "owner@example.test", role: "owner" });
    repository.getOwnerByEmail.mockResolvedValue({ id: "owner-id", email: "owner@example.test", passwordHash: "stored-hash", status: "active", mfaSecretEncrypted: "encrypted" });
    auth.ownerPasswordMatches.mockResolvedValue(true); auth.decryptOwnerMfaSecret.mockReturnValue("secret");
    auth.verifyOwnerTotp.mockReturnValue(200); auth.ownerPasswordHash.mockResolvedValue("new-hash");
    repository.changePassword.mockResolvedValue(true);
  });

  it("requires the current password", async () => {
    auth.ownerPasswordMatches.mockResolvedValue(false);
    const response = await POST(request(valid));
    expect(response.headers.get("location")).toBe(`${origin}/owner/security?error=invalid`);
    expect(repository.changePassword).not.toHaveBeenCalled();
  });

  it("requires a fresh valid MFA step", async () => {
    auth.verifyOwnerTotp.mockReturnValue(null);
    await POST(request(valid));
    expect(repository.changePassword).not.toHaveBeenCalled();
  });

  it("changes atomically and clears the session only after repository success", async () => {
    const response = await POST(request(valid));
    expect(repository.changePassword).toHaveBeenCalledWith({ ownerId: "owner-id", sessionHash: "a".repeat(64), currentPasswordHash: "stored-hash", newPasswordHash: "new-hash", totpStep: 200 });
    expect(response.headers.get("location")).toBe(`${origin}/owner/login?changed=1`);
    expect(response.cookies.get("owner_session")?.maxAge).toBe(0);
  });

  it("rejects cross-origin requests before authorization", async () => {
    expect((await POST(request(valid, "https://attacker.example"))).status).toBe(403);
    expect(auth.requireOwnerSession).not.toHaveBeenCalled();
  });
});
