import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as OTPAuth from "otpauth";

const repository = {
  getChallenge: vi.fn(), completeMfaVerification: vi.fn(),
  completeRecoveryCodeVerification: vi.fn(), recordAudit: vi.fn(),
};
vi.mock("@platform/site-data", () => ({ PostgresOwnerAuthRepository: class { constructor() { return repository; } } }));
vi.mock("../../../../../../lib/rate-limit", () => ({ enforceSubjectRateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
import { encryptOwnerMfaSecret } from "../../../../../../lib/owner-auth";
import { POST } from "./route";

const origin = "https://platform.example";
const challenge = "a".repeat(64);
const secret = "JBSWY3DPEHPK3PXP";
function request(body: Record<string, string>, requestOrigin = origin) {
  return new NextRequest(`${origin}/api/owner/auth/mfa/verify`, {
    method: "POST", headers: { origin: requestOrigin, "sec-fetch-site": requestOrigin === origin ? "same-origin" : "cross-site", "content-type": "application/x-www-form-urlencoded", cookie: `owner_mfa_challenge=${challenge}` },
    body: new URLSearchParams(body),
  });
}

describe("owner MFA completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PUBLIC_APP_URL", origin);
    vi.stubEnv("OWNER_MFA_ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64url"));
    repository.getChallenge.mockResolvedValue({ ownerId: "owner-id", email: "owner@example.test", purpose: "mfa_verify", mfaSecretEncrypted: encryptOwnerMfaSecret(secret), expiresAt: new Date(Date.now() + 60_000).toISOString() });
  });

  it("rejects invalid TOTP without creating a full session", async () => {
    const response = await POST(request({ code: "not-a-code" }));
    expect(response.headers.get("location")).toBe(`${origin}/owner/mfa?error=invalid`);
    expect(response.cookies.get("owner_session")).toBeUndefined();
    expect(repository.completeMfaVerification).not.toHaveBeenCalled();
  });

  it("creates and rotates a full session only after valid TOTP", async () => {
    const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), period: 30 }).generate();
    repository.completeMfaVerification.mockResolvedValue({ ownerId: "owner-id" });
    const response = await POST(request({ code }));
    expect(response.headers.get("location")).toBe(`${origin}/owner`);
    expect(response.cookies.get("owner_session")?.value).toMatch(/^[a-f0-9]{64}$/);
    expect(response.cookies.get("owner_mfa_challenge")?.maxAge).toBe(0);
    expect(repository.completeMfaVerification).toHaveBeenCalledWith(expect.objectContaining({ challengeHash: expect.stringMatching(/^[a-f0-9]{64}$/), sessionHash: expect.stringMatching(/^[a-f0-9]{64}$/), totpStep: expect.any(Number) }));
  });

  it("uses a recovery code only after the password-authenticated challenge", async () => {
    repository.completeRecoveryCodeVerification.mockResolvedValue({ ownerId: "owner-id" });
    const response = await POST(request({ recoveryCode: "ABCDE-12345-FEED0-C0FFE" }));
    expect(response.status).toBe(303);
    expect(repository.completeRecoveryCodeVerification).toHaveBeenCalledWith(expect.objectContaining({ recoveryCodeHash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  });

  it("rejects cross-origin MFA before challenge lookup", async () => {
    expect((await POST(request({ code: "123456" }, "https://attacker.example"))).status).toBe(403);
    expect(repository.getChallenge).not.toHaveBeenCalled();
  });
});
