import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const repository = {
  getOwnerByEmail: vi.fn(), recordAudit: vi.fn(), createPasswordChallenge: vi.fn(),
};
const consume = vi.fn();
vi.mock("@platform/site-data", () => ({ PostgresOwnerAuthRepository: class { constructor() { return repository; } } }));
vi.mock("../../../../../lib/rate-limit", () => ({ clientAddress: () => "127.0.0.1", enforceSubjectRateLimit: (...args: unknown[]) => consume(...args) }));

import { ownerPasswordHash } from "../../../../../lib/owner-auth";
import { POST } from "./route";

const origin = "https://platform.example";
const controlOrigin = "https://control.platform.example";
function request(email = "owner@example.test", password = "correct-password-123", requestOrigin = origin, targetOrigin = origin) {
  return new NextRequest(`${targetOrigin}/api/owner/auth/login`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: requestOrigin, "sec-fetch-site": requestOrigin === targetOrigin ? "same-origin" : "cross-site" },
    body: new URLSearchParams({ email, password }),
  });
}

describe("owner password login", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("PUBLIC_APP_URL", origin);
    vi.stubEnv("CONTROL_PANEL_HOST", "control.platform.example");
    vi.stubEnv("OWNER_MFA_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64url"));
    consume.mockResolvedValue({ allowed: true });
    repository.getOwnerByEmail.mockResolvedValue({ id: "owner-id", email: "owner@example.test", passwordHash: await ownerPasswordHash("correct-password-123"), status: "active" });
  });

  it("rejects cross-origin requests before account lookup", async () => {
    expect((await POST(request(undefined, undefined, "https://attacker.example"))).status).toBe(403);
    expect(repository.getOwnerByEmail).not.toHaveBeenCalled();
  });

  it("accepts password login from the exact configured control origin", async () => {
    const response = await POST(request(undefined, undefined, controlOrigin, controlOrigin));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${controlOrigin}/owner/mfa`);
    expect(repository.getOwnerByEmail).toHaveBeenCalledWith("owner@example.test");
  });

  it("returns the same response for unknown, wrong-password and disabled accounts", async () => {
    repository.getOwnerByEmail.mockResolvedValueOnce(null);
    const unknown = await POST(request("unknown@example.test"));
    const wrong = await POST(request("owner@example.test", "wrong-password"));
    repository.getOwnerByEmail.mockResolvedValueOnce({ id: "owner-id", email: "owner@example.test", passwordHash: await ownerPasswordHash("correct-password-123"), status: "disabled" });
    const disabled = await POST(request());
    for (const response of [unknown, wrong, disabled]) {
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(`${origin}/owner/login?error=invalid`);
      expect(response.cookies.get("owner_session")).toBeUndefined();
    }
  });

  it("applies persistent network and identity rate limits", async () => {
    consume.mockResolvedValueOnce({ allowed: false }).mockResolvedValueOnce({ allowed: true });
    const response = await POST(request());
    expect(response.headers.get("location")).toBe(`${origin}/owner/login?error=rate`);
    expect(consume).toHaveBeenCalledTimes(2);
    expect(repository.getOwnerByEmail).not.toHaveBeenCalled();
  });

  it("creates only a short-lived password-bound MFA challenge", async () => {
    const response = await POST(request());
    expect(response.headers.get("location")).toBe(`${origin}/owner/mfa`);
    expect(response.cookies.get("owner_mfa_challenge")?.value).toMatch(/^[a-f0-9]{64}$/);
    expect(response.cookies.get("owner_session")).toBeUndefined();
    expect(repository.createPasswordChallenge).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "owner-id", purpose: "mfa_enroll", pendingMfaSecretEncrypted: expect.stringMatching(/^v1\./) }));
  });

  it("lets an accepted pending account resume MFA enrollment without issuing a session", async () => {
    repository.getOwnerByEmail.mockResolvedValue({ id: "pending-id", email: "pending@example.test", passwordHash: await ownerPasswordHash("correct-password-123"), status: "pending", role: "operator" });
    const response = await POST(request("pending@example.test"));
    expect(response.headers.get("location")).toBe(`${origin}/owner/mfa`);
    expect(repository.createPasswordChallenge).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "pending-id", purpose: "mfa_enroll" }));
    expect(response.cookies.get("owner_session")).toBeUndefined();
  });

  it("does not fall back to legacy environment credentials", async () => {
    vi.stubEnv("OWNER_EMAIL", "legacy@example.test");
    vi.stubEnv("OWNER_PASSWORD", "legacy-password-long-enough");
    vi.stubEnv("OWNER_API_TOKEN", "legacy-token");
    repository.getOwnerByEmail.mockResolvedValue(null);
    const response = await POST(request("legacy@example.test", "legacy-password-long-enough"));
    expect(response.headers.get("location")).toBe(`${origin}/owner/login?error=invalid`);
    expect(response.cookies.get("owner_session")).toBeUndefined();
  });

  it("fails closed when the MFA encryption key is missing", async () => {
    vi.stubEnv("OWNER_MFA_ENCRYPTION_KEY", "");
    const response = await POST(request());
    expect(response.headers.get("location")).toBe(`${origin}/owner/login?error=configuration`);
    expect(repository.createPasswordChallenge).not.toHaveBeenCalled();
  });
});
