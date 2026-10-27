import { describe, expect, it } from "vitest";
import { getOwnerPostgresPool, getPostgresPool, getRuntimePostgresPool, getSystemPostgresPool, postgresPoolSettings } from "../src/index";

describe("shared PostgreSQL pool", () => {
  it("uses conservative bounded defaults", () => {
    expect(postgresPoolSettings({})).toEqual({
      max: 3,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      queryTimeoutMillis: 15_000,
    });
  });

  it("accepts safe overrides and falls back for unsafe values", () => {
    expect(
      postgresPoolSettings({
        DATABASE_POOL_MAX: "5",
        DATABASE_CONNECTION_TIMEOUT_MS: "2000",
        DATABASE_IDLE_TIMEOUT_MS: "60000",
        DATABASE_QUERY_TIMEOUT_MS: "30000",
      }),
    ).toEqual({
      max: 5,
      connectionTimeoutMillis: 2_000,
      idleTimeoutMillis: 60_000,
      queryTimeoutMillis: 30_000,
    });
    expect(
      postgresPoolSettings({
        DATABASE_POOL_MAX: "1000",
        DATABASE_QUERY_TIMEOUT_MS: "invalid",
      }),
    ).toMatchObject({ max: 3, queryTimeoutMillis: 15_000 });
  });

  it("reuses one pool for the same database and settings", () => {
    const url = "postgresql://test:test@127.0.0.1:5432/shared-pool-test";
    expect(getPostgresPool(url)).toBe(getPostgresPool(url));
  });

  it("requires explicit and separate runtime/system/owner connection sources", () => {
    expect(() => getRuntimePostgresPool(" ")).toThrow(/DATABASE_RUNTIME_URL/);
    expect(() => getSystemPostgresPool(" ")).toThrow(/DATABASE_SYSTEM_URL/);
    expect(() => getOwnerPostgresPool(" ")).toThrow(/DATABASE_OWNER_URL/);
    const runtime = getRuntimePostgresPool("postgresql://runtime:test@127.0.0.1:5432/boundary-test");
    const system = getSystemPostgresPool("postgresql://system:test@127.0.0.1:5432/boundary-test");
    const owner = getOwnerPostgresPool("postgresql://owner:test@127.0.0.1:5432/boundary-test");
    expect(runtime).not.toBe(system);
    expect(owner).not.toBe(runtime);
    expect(owner).not.toBe(system);
  });
});
