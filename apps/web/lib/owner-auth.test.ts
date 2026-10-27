import { afterEach, describe, expect, it, vi } from "vitest";
import * as OTPAuth from "otpauth";
import {
  OWNER_CHALLENGE_SECONDS, OWNER_SESSION_SECONDS, createOwnerMfaEnrollment,
  decryptOwnerMfaSecret, encryptOwnerMfaSecret, generateOwnerRecoveryCodes,
  newOwnerToken, normalizeOwnerEmail, normalizeOwnerRecoveryCode,
  ownerCookieOptions, ownerIdentityHash, ownerMfaEncryptionConfigured,
  ownerPasswordHash, ownerPasswordMatches, ownerRecoveryCodeHash,
  ownerTokenHash, validOwnerToken, validateOwnerSessionToken, verifyOwnerTotp,
} from "./owner-auth";

const key = Buffer.alloc(32, 7).toString("base64url");
afterEach(() => vi.unstubAllEnvs());

describe("owner authentication cryptographic boundaries", () => {
  it("normalizes owner email without accepting non-strings", () => {
    expect(normalizeOwnerEmail("  OWNER@Example.TEST ")).toBe("owner@example.test");
    expect(normalizeOwnerEmail(null)).toBe("");
  });

  it("hashes and verifies passwords without retaining plaintext", async () => {
    const hash = await ownerPasswordHash("a-long-owner-password");
    expect(hash).not.toContain("a-long-owner-password");
    await expect(ownerPasswordMatches("a-long-owner-password", hash)).resolves.toBe(true);
    await expect(ownerPasswordMatches("wrong-password", hash)).resolves.toBe(false);
  });

  it("encrypts MFA secrets with authenticated random envelopes", () => {
    vi.stubEnv("OWNER_MFA_ENCRYPTION_KEY", key);
    const first = encryptOwnerMfaSecret("JBSWY3DPEHPK3PXP");
    const second = encryptOwnerMfaSecret("JBSWY3DPEHPK3PXP");
    expect(first).not.toBe(second);
    expect(first).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptOwnerMfaSecret(first)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("fails closed for missing, short and non-canonical MFA keys", () => {
    expect(ownerMfaEncryptionConfigured()).toBe(false);
    expect(() => encryptOwnerMfaSecret("secret")).toThrow(/32-byte key/);
    vi.stubEnv("OWNER_MFA_ENCRYPTION_KEY", "short");
    expect(() => encryptOwnerMfaSecret("secret")).toThrow(/32-byte key/);
    vi.stubEnv("OWNER_MFA_ENCRYPTION_KEY", `${key}=`);
    expect(() => encryptOwnerMfaSecret("secret")).toThrow(/32-byte key/);
  });

  it("rejects tampered encrypted MFA material", () => {
    vi.stubEnv("OWNER_MFA_ENCRYPTION_KEY", key);
    const encrypted = encryptOwnerMfaSecret("JBSWY3DPEHPK3PXP");
    const replacement = encrypted.endsWith("A") ? "B" : "A";
    expect(() => decryptOwnerMfaSecret(`${encrypted.slice(0, -1)}${replacement}`)).toThrow(/decrypt/);
  });

  it("creates a standards-based enrollment URI without returning a session", () => {
    const enrollment = createOwnerMfaEnrollment("owner@example.test");
    expect(enrollment.secret).toMatch(/^[A-Z2-7]+$/);
    expect(enrollment.uri).toContain("otpauth://totp/");
    expect(enrollment).not.toHaveProperty("session");
  });

  it("accepts a current TOTP in the narrow window and rejects malformed codes", () => {
    const now = 1_800_000_000_000;
    const secret = "JBSWY3DPEHPK3PXP";
    const token = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), algorithm: "SHA1", digits: 6, period: 30 }).generate({ timestamp: now });
    expect(verifyOwnerTotp(secret, token, now)).toBe(OTPAuth.TOTP.counter({ timestamp: now, period: 30 }));
    expect(verifyOwnerTotp(secret, "abcdef", now)).toBeNull();
    expect(verifyOwnerTotp(secret, "0000000", now)).toBeNull();
  });

  it("rejects a TOTP outside the plus-or-minus one-step window", () => {
    const now = 1_800_000_000_000;
    const secret = "JBSWY3DPEHPK3PXP";
    const token = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), period: 30 }).generate({ timestamp: now - 90_000 });
    expect(verifyOwnerTotp(secret, token, now)).toBeNull();
  });

  it("generates ten unique high-entropy recovery codes", () => {
    const codes = generateOwnerRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => /^[A-F0-9]{5}(?:-[A-F0-9]{5}){3}$/.test(code))).toBe(true);
  });

  it("canonicalizes recovery codes and hashes rather than stores raw values", () => {
    const code = "ABCDE-12345-FEED0-C0FFE";
    expect(normalizeOwnerRecoveryCode(code.toLowerCase())).toBe("ABCDE12345FEED0C0FFE");
    expect(ownerRecoveryCodeHash(code)).toBe(ownerTokenHash("ABCDE12345FEED0C0FFE"));
    expect(ownerRecoveryCodeHash(code)).not.toContain(code);
    expect(normalizeOwnerRecoveryCode("too-short")).toBe("");
  });

  it("creates strict 256-bit opaque tokens and stable identity fingerprints", () => {
    const token = newOwnerToken();
    expect(validOwnerToken(token)).toBe(true);
    expect(validOwnerToken(`${token}=`)).toBe(false);
    expect(validOwnerToken(token.toUpperCase())).toBe(false);
    expect(ownerIdentityHash(" OWNER@example.test ")).toBe(ownerIdentityHash("owner@example.test"));
  });

  it("rejects malformed sessions before the database is called", async () => {
    const repository = { getSession: vi.fn() };
    await expect(validateOwnerSessionToken("challenge", repository)).resolves.toBeNull();
    expect(repository.getSession).not.toHaveBeenCalled();
  });

  it("loads only the hash of a canonical session token from the database", async () => {
    const token = "a".repeat(64);
    const session = { sessionId: "s", ownerId: "o", email: "owner@example.test", mfaCompletedAt: "2026-01-01", expiresAt: "2026-01-02", lastUsedAt: "2026-01-01" };
    const repository = { getSession: vi.fn().mockResolvedValue(session) };
    await expect(validateOwnerSessionToken(token, repository)).resolves.toBe(session);
    expect(repository.getSession).toHaveBeenCalledWith(ownerTokenHash(token));
    expect(repository.getSession).not.toHaveBeenCalledWith(token);
  });

  it("uses bounded strict cookies for challenges and full sessions", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(ownerCookieOptions(OWNER_CHALLENGE_SECONDS)).toMatchObject({ httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 300 });
    expect(ownerCookieOptions(OWNER_SESSION_SECONDS).maxAge).toBe(43_200);
  });
});
