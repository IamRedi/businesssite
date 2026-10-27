import { describe, expect, it, vi } from "vitest";
import {
  normalizeSiteAdminEmail,
  passwordHash,
  passwordMatches,
  rotateSiteAdminSession,
  siteAdminSessionCookieOptions,
  siteAdminSessionTokenFromCookieHeader,
  tokenHash,
  validSiteAdminToken,
} from "./site-admin-auth";

describe("business admin credentials", () => {
  it("uses a salted password hash and rejects a wrong password", async () => {
    const stored = await passwordHash("a-correct-password-with-12-chars");
    expect(stored).not.toContain("a-correct-password");
    expect(await passwordMatches("a-correct-password-with-12-chars", stored)).toBe(true);
    expect(await passwordMatches("a-wrong-password-with-12-chars", stored)).toBe(false);
  });

  it("accepts only the new password after the stored hash is replaced", async () => {
    const oldPassword = "old-password-with-12-chars";
    const newPassword = "new-password-with-12-chars";
    const oldHash = await passwordHash(oldPassword);
    const newHash = await passwordHash(newPassword);
    expect(await passwordMatches(oldPassword, oldHash)).toBe(true);
    expect(await passwordMatches(oldPassword, newHash)).toBe(false);
    expect(await passwordMatches(newPassword, newHash)).toBe(true);
  });

  it("stores reset and session token fingerprints, not raw tokens", () => {
    const fingerprint = tokenHash("private-reset-token");
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint).not.toContain("private-reset-token");
  });

  it("rejects malformed password hashes and session tokens without throwing", async () => {
    await expect(passwordMatches("password", "malformed")).resolves.toBe(false);
    expect(validSiteAdminToken("short-token")).toBe(false);
    expect(siteAdminSessionTokenFromCookieHeader("site_admin_session=short-token")).toBeUndefined();
  });

  it("normalizes account email casing and whitespace consistently", () => {
    expect(normalizeSiteAdminEmail("  Owner@Example.TEST  ")).toBe("owner@example.test");
  });

  it("rotates a valid prior session and creates an independent random token", async () => {
    const previous = "a".repeat(64);
    const repository = {
      revokeAdminSession: vi.fn().mockResolvedValue(true),
      createAdminSession: vi.fn().mockResolvedValue(undefined),
    };
    const token = await rotateSiteAdminSession(repository as never, "account-1", previous, 60);
    expect(repository.revokeAdminSession).toHaveBeenCalledWith(tokenHash(previous));
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(token).not.toBe(previous);
    expect(repository.createAdminSession).toHaveBeenCalledWith(
      "account-1",
      tokenHash(token),
      expect.any(String),
    );
  });

  it("uses hardened host-only cookie attributes for create and clear", () => {
    expect(siteAdminSessionCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
    });
    expect(siteAdminSessionCookieOptions(0)).toMatchObject({ maxAge: 0, path: "/" });
    expect(siteAdminSessionCookieOptions()).not.toHaveProperty("domain");
  });
});
