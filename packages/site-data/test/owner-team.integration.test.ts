import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { PostgresOwnerAuthRepository, PostgresOwnerTeamRepository } from "../src/index";

const connectionString = process.env.DATABASE_URL;
const enabled = Boolean(connectionString && process.env.OWNER_AUTH_DESTRUCTIVE_TESTS === "true");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

describe.sequential.runIf(enabled)("PostgresOwnerTeamRepository", () => {
  let pool: Pool;
  let team: PostgresOwnerTeamRepository;
  let auth: PostgresOwnerAuthRepository;
  const ownerA = randomUUID();
  const ownerB = randomUUID();
  const passwordA = "hash-owner-a";
  const passwordB = "hash-owner-b";
  const sessionA = hash("team-owner-a-session");
  const sessionB = hash("team-owner-b-session");

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    team = new PostgresOwnerTeamRepository(connectionString, sessionA);
    auth = new PostgresOwnerAuthRepository(connectionString);
    await pool.query("truncate owner_auth_audit_events,owner_invitations,owner_mfa_recovery_codes,owner_sessions,owner_auth_challenges,owner_accounts cascade");
    await pool.query(
      `insert into owner_accounts(id,email,password_hash,status,role,mfa_secret_encrypted,mfa_enrolled_at,mfa_last_used_step)
       values($1,'a@example.test',$2,'active','owner','v1.a',now(),10),
             ($3,'b@example.test',$4,'active','owner','v1.b',now(),10)`,
      [ownerA, passwordA, ownerB, passwordB],
    );
    await pool.query("insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at) values(gen_random_uuid(),$1,$2,now(),now()+interval '12 hours'),(gen_random_uuid(),$3,$4,now(),now()+interval '12 hours')",[ownerA,sessionA,ownerB,sessionB]);
  });

  afterAll(async () => {
    await pool.query("truncate owner_auth_audit_events,owner_invitations,owner_mfa_recovery_codes,owner_sessions,owner_auth_challenges,owner_accounts cascade");
    await pool.end();
  });

  it("allows only a fresh active owner to create a hash-only invitation", async () => {
    const raw = "invite-raw-secret";
    const result = await team.createInvitation({ actorId: ownerA, currentPasswordHash: passwordA, totpStep: 11, email: "viewer@example.test", role: "viewer", tokenHash: hash(raw), expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(result.ok).toBe(true);
    const stored = await pool.query("select token_hash,email,role from owner_invitations where id=$1", [result.ok ? result.invitationId : null]);
    expect(stored.rows[0]).toMatchObject({ token_hash: hash(raw), email: "viewer@example.test", role: "viewer" });
    expect(JSON.stringify(stored.rows)).not.toContain(raw);
    expect((await team.createInvitation({ actorId: ownerB, currentPasswordHash: "wrong", totpStep: 11, email: "denied@example.test", role: "admin", tokenHash: hash("denied"), expiresAt: new Date(Date.now() + 60_000).toISOString() })).ok).toBe(false);
  });

  it("refuses an active duplicate and permits a new invitation after expiry", async () => {
    const duplicate = await team.createInvitation({ actorId: ownerA, currentPasswordHash: passwordA, totpStep: 12, email: "viewer@example.test", role: "admin", tokenHash: hash("duplicate"), expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(duplicate).toMatchObject({ ok: false, reason: "conflict" });
    await pool.query("update owner_invitations set created_at=now() - interval '2 minutes',expires_at=now() - interval '1 second' where email='viewer@example.test'");
    const replacement = await team.createInvitation({ actorId: ownerA, currentPasswordHash: passwordA, totpStep: 13, email: "viewer@example.test", role: "admin", tokenHash: hash("after-expiry"), expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(replacement.ok).toBe(true);
  });

  it("resend atomically invalidates the old token and revoke invalidates the replacement", async () => {
    const current = (await pool.query("select id from owner_invitations where token_hash=$1", [hash("after-expiry")])).rows[0];
    const resent = await team.resendInvitation({ actorId: ownerA, currentPasswordHash: passwordA, totpStep: 14, invitationId: current.id, tokenHash: hash("resent"), expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(resent.ok).toBe(true);
    expect(await team.getInvitationByToken(hash("after-expiry"))).toBeNull();
    expect(await team.getInvitationByToken(hash("resent"))).not.toBeNull();
    const revoked = await team.revokeInvitation({ actorId: ownerA, currentPasswordHash: passwordA, totpStep: 15, invitationId: resent.ok ? resent.invitationId! : "", });
    expect(revoked.ok).toBe(true);
    expect(await team.getInvitationByToken(hash("resent"))).toBeNull();
  });

  it("accepts a token once, binds email and role, and leaves the account pending without a session", async () => {
    await team.createInvitation({ actorId: ownerA, currentPasswordHash: passwordA, totpStep: 16, email: "operator@example.test", role: "operator", tokenHash: hash("accept-once"), expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const input = { tokenHash: hash("accept-once"), passwordHash: "new-password-hash", challengeHash: hash("pending-challenge"), pendingMfaSecretEncrypted: "v1.pending", challengeExpiresAt: new Date(Date.now() + 60_000).toISOString() };
    const [first, second] = await Promise.all([team.acceptInvitation(input), team.acceptInvitation({ ...input, challengeHash: hash("other-challenge") })]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const account = await auth.getOwnerByEmail("operator@example.test");
    expect(account).toMatchObject({ email: "operator@example.test", role: "operator", status: "pending", passwordHash: "new-password-hash" });
    const sessions = await pool.query("select count(*)::int as count from owner_sessions where owner_id=$1", [account!.id]);
    expect(sessions.rows[0].count).toBe(0);
    expect(await team.acceptInvitation(input)).toBeNull();
  });

  it("activates an accepted account only after mandatory MFA enrollment", async () => {
    const account = await auth.getOwnerByEmail("operator@example.test");
    expect(await auth.getSession(hash("pending-session"))).toBeNull();
    expect(await auth.completeMfaEnrollment({ challengeHash: hash("pending-challenge"), totpStep: 100, recoveryCodeHashes: [hash("pending-recovery")], sessionHash: hash("activated-session"), sessionExpiresAt: new Date(Date.now() + 60_000).toISOString() })).toEqual({ ownerId: account!.id });
    expect(await auth.getOwnerByEmail("operator@example.test")).toMatchObject({ status: "active", role: "operator" });
    expect(await auth.getSession(hash("activated-session"))).toMatchObject({ ownerId: account!.id, role: "operator" });
  });

  it("role change revokes only target sessions and challenges", async () => {
    await pool.query("insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at) values($1,$2,$3,now(),now()+interval '1 hour'),($4,$5,$6,now(),now()+interval '1 hour')", [randomUUID(), ownerB, hash("target-session"), randomUUID(), ownerA, hash("actor-session")]);
    const result = await team.changeRole({ actorId: ownerA, currentPasswordHash: passwordA, totpStep: 17, targetOwnerId: ownerB, role: "admin" });
    expect(result).toMatchObject({ ok: true, sessionsRevoked: 2 });
    expect(await auth.getSession(hash("target-session"))).toBeNull();
    expect(await auth.getSession(hash("actor-session"))).not.toBeNull();
  });

  it("disable revokes target sessions/challenges and reactivation creates no session or MFA bypass", async () => {
    const operator = await auth.getOwnerByEmail("operator@example.test");
    await pool.query("insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at) values($1,$2,$3,now(),now()+interval '1 hour')", [randomUUID(), operator!.id, hash("operator-disabled-session")]);
    await auth.createPasswordChallenge({ ownerId: operator!.id, tokenHash: hash("operator-disabled-challenge"), purpose: "mfa_verify", expiresAt: new Date(Date.now() + 60_000).toISOString(), identityHash: hash("operator@example.test") });
    expect(await team.changeStatus({ actorId: ownerA, currentPasswordHash: passwordA, totpStep: 18, targetOwnerId: operator!.id, status: "disabled" })).toMatchObject({ ok: true, status: "disabled", sessionsRevoked: 2 });
    expect(await auth.getSession(hash("operator-disabled-session"))).toBeNull();
    expect(await auth.getChallenge(hash("operator-disabled-challenge"))).toBeNull();
    expect(await team.changeStatus({ actorId: ownerA, currentPasswordHash: passwordA, totpStep: 19, targetOwnerId: operator!.id, status: "active" })).toMatchObject({ ok: true, status: "active" });
    expect(await pool.query("select count(*)::int as count from owner_sessions where owner_id=$1 and revoked_at is null and expires_at > now()", [operator!.id]).then((result) => result.rows[0].count)).toBe(0);
    expect(await auth.getOwnerByEmail("operator@example.test")).toMatchObject({ status: "active", mfaEnrolledAt: expect.any(String) });
  });

  it("explicit session revocation affects only the selected account", async () => {
    const operator = await auth.getOwnerByEmail("operator@example.test");
    await pool.query("insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at) values($1,$2,$3,now(),now()+interval '1 hour'),($4,$5,$6,now(),now()+interval '1 hour')", [randomUUID(), operator!.id, hash("operator-target-only"), randomUUID(), ownerA, hash("owner-not-target")]);
    expect(await team.revokeTargetSessions({ actorId: ownerA, currentPasswordHash: passwordA, totpStep: 20, targetOwnerId: operator!.id })).toMatchObject({ ok: true, sessionsRevoked: 1 });
    expect(await auth.getSession(hash("operator-target-only"))).toBeNull();
    expect(await auth.getSession(hash("owner-not-target"))).not.toBeNull();
  });

  it("prevents demotion and disable of the last active MFA-enrolled owner", async () => {
    expect(await team.changeRole({ actorId: ownerA, currentPasswordHash: passwordA, totpStep: 21, targetOwnerId: ownerA, role: "admin" })).toMatchObject({ ok: false, reason: "last_owner" });
    expect(await team.changeStatus({ actorId: ownerA, currentPasswordHash: passwordA, totpStep: 22, targetOwnerId: ownerA, status: "disabled" })).toMatchObject({ ok: false, reason: "last_owner" });
    expect(await auth.administrativeRecovery({ email: "a@example.test", passwordHash: "recovery-must-not-apply", identityHash: hash("a@example.test") })).toBe(false);
    expect(await auth.getOwnerByEmail("a@example.test")).toMatchObject({ passwordHash: passwordA, mfaEnrolledAt: expect.any(String) });
  });

  it("serializes concurrent cross-demotions so one usable owner always remains", async () => {
    await pool.query("update owner_accounts set role='owner',status='active',mfa_enrolled_at=now(),mfa_last_used_step=30 where id in ($1,$2)", [ownerA, ownerB]);
    await pool.query("insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at) values(gen_random_uuid(),$1,$2,now(),now()+interval '1 hour') on conflict(token_hash) do update set revoked_at=null,expires_at=excluded.expires_at",[ownerB,sessionB]);
    const results = await Promise.all([
      team.changeRole({ actorId: ownerA, currentPasswordHash: passwordA, totpStep: 31, targetOwnerId: ownerB, role: "operator" }),
      team.changeRole({ actorId: ownerB, sessionHash: sessionB, currentPasswordHash: passwordB, totpStep: 31, targetOwnerId: ownerA, role: "operator" }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const eligible = await pool.query("select count(*)::int as count from owner_accounts where role='owner' and status='active' and mfa_enrolled_at is not null");
    expect(eligible.rows[0].count).toBe(1);
  });

  it("audits actor and target without authentication or invitation secrets", async () => {
    const audit = await pool.query("select owner_id,target_owner_id,invitation_id,details::text from owner_auth_audit_events");
    const serialized = JSON.stringify(audit.rows);
    expect(audit.rows.some((row) => row.owner_id && row.target_owner_id)).toBe(true);
    for (const secret of ["invite-raw-secret", "accept-once", "pending-challenge", passwordA, passwordB, "new-password-hash"])
      expect(serialized).not.toContain(secret);
  });
});
