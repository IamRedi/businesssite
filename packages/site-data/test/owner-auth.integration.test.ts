import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { PostgresOwnerAuthRepository } from "../src/index";

const connectionString = process.env.DATABASE_URL;
const enabled = Boolean(connectionString && process.env.OWNER_AUTH_DESTRUCTIVE_TESTS === "true");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

describe.sequential.runIf(enabled)("PostgresOwnerAuthRepository", () => {
  let pool: Pool;
  let repository: PostgresOwnerAuthRepository;
  let ownerId = "";
  const email = `owner-${randomUUID()}@example.test`;
  const passwordHash = "test-password-hash-without-plaintext";

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    repository = new PostgresOwnerAuthRepository(connectionString);
    await pool.query("truncate owner_auth_audit_events,owner_mfa_recovery_codes,owner_sessions,owner_auth_challenges,owner_accounts cascade");
  });

  afterAll(async () => {
    await pool.query("truncate owner_auth_audit_events,owner_mfa_recovery_codes,owner_sessions,owner_auth_challenges,owner_accounts cascade");
    await pool.end();
  });

  it("bootstraps the first normalized database owner only when the table is empty", async () => {
    const result = await repository.bootstrapFirstOwner({ email: `  ${email.toUpperCase()} `, passwordHash, identityHash: hash(email) });
    expect(result.created).toBe(true);
    ownerId = result.created ? result.ownerId : "";
    expect(await repository.getOwnerByEmail(email)).toMatchObject({ id: ownerId, email, passwordHash, status: "active", role: "owner" });
  });

  it("refuses a second bootstrap and audits only an identity fingerprint", async () => {
    expect(await repository.bootstrapFirstOwner({ email: "second@example.test", passwordHash: "second-secret", identityHash: hash("second@example.test") })).toEqual({ created: false });
    const audit = await pool.query("select identity_hash,details::text from owner_auth_audit_events where action='owner.bootstrap' and outcome='denied'");
    expect(audit.rows[0].identity_hash).toBe(hash("second@example.test"));
    expect(JSON.stringify(audit.rows)).not.toContain("second-secret");
  });

  it("stores only challenge hashes and rejects expired challenges", async () => {
    const raw = "challenge-not-stored";
    await repository.createPasswordChallenge({ ownerId, tokenHash: hash(raw), purpose: "mfa_enroll", pendingMfaSecretEncrypted: "v1.encrypted", expiresAt: new Date(Date.now() - 1_000).toISOString(), identityHash: hash(email) });
    expect(await repository.getChallenge(hash(raw))).toBeNull();
    const row = await pool.query("select token_hash from owner_auth_challenges where owner_id=$1 order by created_at desc limit 1", [ownerId]);
    expect(row.rows[0].token_hash).toBe(hash(raw));
    expect(row.rows[0].token_hash).not.toBe(raw);
  });

  it("requires a valid purpose-bound challenge to enroll MFA and stores encrypted material", async () => {
    const challenge = hash("enrollment-challenge");
    await repository.createPasswordChallenge({ ownerId, tokenHash: challenge, purpose: "mfa_enroll", pendingMfaSecretEncrypted: "v1.iv.cipher.tag", expiresAt: new Date(Date.now() + 60_000).toISOString(), identityHash: hash(email) });
    expect(await repository.completeMfaVerification({ challengeHash: challenge, totpStep: 1, sessionHash: hash("wrong-purpose"), sessionExpiresAt: new Date(Date.now() + 60_000).toISOString() })).toBeNull();
    const result = await repository.completeMfaEnrollment({ challengeHash: challenge, totpStep: 100, recoveryCodeHashes: [hash("recovery-one"), hash("recovery-two")], sessionHash: hash("first-session"), sessionExpiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(result).toEqual({ ownerId });
    const stored = await pool.query("select mfa_secret_encrypted from owner_accounts where id=$1", [ownerId]);
    expect(stored.rows[0].mfa_secret_encrypted).toBe("v1.iv.cipher.tag");
  });

  it("makes enrollment challenges single-use and full sessions hash-backed", async () => {
    expect(await repository.completeMfaEnrollment({ challengeHash: hash("enrollment-challenge"), totpStep: 101, recoveryCodeHashes: [], sessionHash: hash("replay"), sessionExpiresAt: new Date(Date.now() + 60_000).toISOString() })).toBeNull();
    expect(await repository.getSession(hash("first-session"))).toMatchObject({ ownerId, email });
    const stored = await pool.query("select token_hash from owner_sessions where owner_id=$1", [ownerId]);
    expect(stored.rows.map((row) => row.token_hash)).toContain(hash("first-session"));
    expect(JSON.stringify(stored.rows)).not.toContain('"first-session"');
  });

  it("rejects replay of one TOTP step and consumes a later challenge once", async () => {
    const first = hash("verify-one");
    await repository.createPasswordChallenge({ ownerId, tokenHash: first, purpose: "mfa_verify", expiresAt: new Date(Date.now() + 60_000).toISOString(), identityHash: hash(email) });
    expect(await repository.completeMfaVerification({ challengeHash: first, totpStep: 100, sessionHash: hash("replayed-step"), sessionExpiresAt: new Date(Date.now() + 60_000).toISOString() })).toBeNull();
    const later = hash("verify-later");
    await repository.createPasswordChallenge({ ownerId, tokenHash: later, purpose: "mfa_verify", expiresAt: new Date(Date.now() + 60_000).toISOString(), identityHash: hash(email) });
    expect(await repository.completeMfaVerification({ challengeHash: later, totpStep: 101, sessionHash: hash("second-session"), sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(), previousSessionHash: hash("first-session") })).toEqual({ ownerId });
    expect(await repository.completeMfaVerification({ challengeHash: later, totpStep: 102, sessionHash: hash("challenge-replay"), sessionExpiresAt: new Date(Date.now() + 60_000).toISOString() })).toBeNull();
    expect(await repository.getSession(hash("first-session"))).toBeNull();
  });

  it("binds one-time recovery codes to one owner and password challenge", async () => {
    const otherId = randomUUID();
    await pool.query("insert into owner_accounts(id,email,password_hash,mfa_secret_encrypted,mfa_enrolled_at) values($1,$2,$3,$4,now())", [otherId, `other-${randomUUID()}@example.test`, "other-hash", "v1.other"]);
    const wrongOwnerChallenge = hash("other-challenge");
    await repository.createPasswordChallenge({ ownerId: otherId, tokenHash: wrongOwnerChallenge, purpose: "mfa_verify", expiresAt: new Date(Date.now() + 60_000).toISOString(), identityHash: hash("other") });
    expect(await repository.completeRecoveryCodeVerification({ challengeHash: wrongOwnerChallenge, recoveryCodeHash: hash("recovery-one"), sessionHash: hash("cross-owner"), sessionExpiresAt: new Date(Date.now() + 60_000).toISOString() })).toBeNull();
    const ownChallenge = hash("recovery-challenge");
    await repository.createPasswordChallenge({ ownerId, tokenHash: ownChallenge, purpose: "mfa_verify", expiresAt: new Date(Date.now() + 60_000).toISOString(), identityHash: hash(email) });
    expect(await repository.completeRecoveryCodeVerification({ challengeHash: ownChallenge, recoveryCodeHash: hash("recovery-one"), sessionHash: hash("recovery-session"), sessionExpiresAt: new Date(Date.now() + 60_000).toISOString() })).toEqual({ ownerId });
    expect(await repository.completeRecoveryCodeVerification({ challengeHash: ownChallenge, recoveryCodeHash: hash("recovery-one"), sessionHash: hash("recovery-replay"), sessionExpiresAt: new Date(Date.now() + 60_000).toISOString() })).toBeNull();
  });

  it("revokes logout server-side idempotently and rejects old-cookie replay", async () => {
    expect(await repository.getSession(hash("recovery-session"))).toMatchObject({ ownerId });
    expect(await repository.revokeCurrentSession(hash("recovery-session"))).toBe(true);
    expect(await repository.revokeCurrentSession(hash("recovery-session"))).toBe(true);
    expect(await repository.getSession(hash("recovery-session"))).toBeNull();
  });

  it("rejects expired sessions and sessions belonging to disabled owners", async () => {
    await pool.query("insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at,created_at) values($1,$2,$3,now(),now() + interval '1 second',now() - interval '1 minute')", [randomUUID(), ownerId, hash("expired-session")]);
    await pool.query("update owner_sessions set expires_at=now() - interval '1 second' where token_hash=$1", [hash("expired-session")]);
    expect(await repository.getSession(hash("expired-session"))).toBeNull();
    expect(await repository.setOwnerStatus(ownerId, "disabled")).toBe(true);
    expect(await repository.getSession(hash("second-session"))).toBeNull();
    expect(await repository.setOwnerStatus(ownerId, "active")).toBe(true);
  });

  it("changes password atomically with a fresh step and revokes every session", async () => {
    await pool.query("update owner_accounts set mfa_last_used_step=101 where id=$1", [ownerId]);
    await pool.query("insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at) values($1,$2,$3,now(),now() + interval '1 hour'),($4,$2,$5,now(),now() + interval '1 hour')", [randomUUID(), ownerId, hash("password-a"), randomUUID(), hash("password-b")]);
    expect(await repository.changePassword({ ownerId, sessionHash: hash("password-a"), currentPasswordHash: "wrong", newPasswordHash: "new", totpStep: 102 })).toBe(false);
    expect(await repository.changePassword({ ownerId, sessionHash: hash("password-a"), currentPasswordHash: passwordHash, newPasswordHash: "new-password-hash", totpStep: 102 })).toBe(true);
    expect(await repository.getSession(hash("password-a"))).toBeNull();
    expect(await repository.getSession(hash("password-b"))).toBeNull();
  });

  it("administrative recovery resets MFA and revokes sessions/challenges", async () => {
    await pool.query("insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at) values($1,$2,$3,now(),now() + interval '1 hour')", [randomUUID(), ownerId, hash("admin-recovery-session")]);
    await repository.createPasswordChallenge({ ownerId, tokenHash: hash("admin-recovery-challenge"), purpose: "mfa_verify", expiresAt: new Date(Date.now() + 60_000).toISOString(), identityHash: hash(email) });
    expect(await repository.administrativeRecovery({ email, passwordHash: "recovered-password-hash", identityHash: hash(email) })).toBe(true);
    expect(await repository.getSession(hash("admin-recovery-session"))).toBeNull();
    expect(await repository.getChallenge(hash("admin-recovery-challenge"))).toBeNull();
    expect(await repository.getOwnerByEmail(email)).toMatchObject({ passwordHash: "recovered-password-hash", mfaEnrolledAt: undefined, mfaSecretEncrypted: undefined });
  });

  it("audit details never contain authentication secrets", async () => {
    const audit = await pool.query("select action,outcome,identity_hash,details::text from owner_auth_audit_events");
    const serialized = JSON.stringify(audit.rows);
    for (const secret of [passwordHash, "new-password-hash", "recovered-password-hash", "enrollment-challenge", "recovery-one", "first-session", "v1.iv.cipher.tag"])
      expect(serialized).not.toContain(secret);
    expect(audit.rows.map((row) => row.action)).toEqual(expect.arrayContaining(["owner.bootstrap", "owner.password_login", "owner.mfa_enrollment", "owner.mfa_verification", "owner.recovery_code_use", "owner.logout", "owner.password_change", "owner.sessions_revoked", "owner.administrative_recovery", "owner.account_status_change"]));
  });
});
