import { describe, expect, it } from "vitest";
import { assertAttestationSession, attestationConnection, type RuntimeDatabaseTarget } from "../src/runtime-attestation";

const target: RuntimeDatabaseTarget = {
  database: "neondb",
  hosts: ["canonical.neon.tech"],
  actors: [{ key: "DATABASE_RUNTIME_URL", role: "bsrc_runtime_prod", membership: "bsrc_runtime", forbiddenMemberships: ["bsrc_system"], readiness: true }],
};
const actor = target.actors[0];

describe("runtime database attestation", () => {
  it("constructs a verified-TLS client only from the canonical binding", () => {
    const config = attestationConnection("postgresql://bsrc_runtime_prod:test@canonical.neon.tech/neondb?sslmode=require&channel_binding=require", target, actor);
    expect(config).toMatchObject({ host: "canonical.neon.tech", port: 5432, database: "neondb", user: "bsrc_runtime_prod", enableChannelBinding: true });
    expect(config.ssl).toEqual({ rejectUnauthorized: true, servername: "canonical.neon.tech" });
  });

  it.each([
    undefined,
    "postgresql://bsrc_runtime_prod:test@other.neon.tech/neondb",
    "postgresql://bsrc_system_prod:test@canonical.neon.tech/neondb",
    "postgresql://bsrc_runtime_prod:test@canonical.neon.tech/other",
    "postgresql://bsrc_runtime_prod:test@canonical.neon.tech/neondb?host=localhost",
    "postgresql://bsrc_runtime_prod:test@canonical.neon.tech/neondb?sslmode=disable",
  ])("rejects redirected or non-canonical bindings", value => {
    expect(() => attestationConnection(value, target, actor)).toThrow("Runtime binding authority mismatch");
  });

  it("requires the expected least-privilege read-only session", () => {
    const row = { database: "neondb", actor: actor.role, session_actor: actor.role, rolsuper: false, rolbypassrls: false,
      rolcreatedb: false, rolcreaterole: false, rolcanlogin: true, expected_membership: true,
      forbidden_membership: false, schema_usage: true, read_only: true };
    expect(() => assertAttestationSession(row, target, actor)).not.toThrow();
    for (const key of ["rolsuper", "rolbypassrls", "rolcreatedb", "rolcreaterole", "forbidden_membership"])
      expect(() => assertAttestationSession({ ...row, [key]: true }, target, actor)).toThrow();
  });
});
