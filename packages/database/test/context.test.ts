import { describe, expect, it, vi } from "vitest";
import {
  currentDatabaseContext,
  databaseRlsMode,
  withDatabaseContext,
  withSiteContext,
  type Pool,
} from "../src/index";

function fakePool(failOnCallback = false) {
  const calls: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      calls.push(sql);
      if (failOnCallback && sql === "select callback") throw new Error("callback failed");
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  return {
    pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    client,
    calls,
  };
}

describe("transaction-local database context", () => {
  const siteId = "11111111-1111-4111-8111-111111111111";

  it("validates all rollout modes", () => {
    expect(databaseRlsMode({})).toBe("off");
    expect(databaseRlsMode({ DATABASE_RLS_MODE: "pilot" })).toBe("pilot");
    expect(databaseRlsMode({ DATABASE_RLS_MODE: "enforced" })).toBe("enforced");
    expect(() => databaseRlsMode({ DATABASE_RLS_MODE: "wrong" })).toThrow(/off, pilot, or enforced/);
  });

  it("uses one client, transaction-local set_config, commit, reset, and release", async () => {
    const { pool, client, calls } = fakePool();
    const result = await withSiteContext(pool, siteId, async (scoped) => {
      expect(scoped).toBe(client);
      expect(currentDatabaseContext()).toMatchObject({ actorKind: "site_admin", siteId });
      await scoped.query("select callback");
      return "ok";
    }, "request-1");
    expect(result).toBe("ok");
    expect(calls[0]).toBe("begin");
    expect(calls[1]).toContain("set_config('app.actor_kind', $1, true)");
    expect(calls).toContain("commit");
    expect(calls.at(-1)).toContain("reset app.actor_kind");
    expect(client.release).toHaveBeenCalledOnce();
    expect(currentDatabaseContext()).toBeUndefined();
  });

  it("rolls back callback errors and does not leak async context", async () => {
    const { pool, calls, client } = fakePool(true);
    await expect(withSiteContext(pool, siteId, (scoped) => scoped.query("select callback"))).rejects.toThrow("callback failed");
    expect(calls).toContain("rollback");
    expect(calls).not.toContain("commit");
    expect(client.release).toHaveBeenCalledOnce();
    expect(currentDatabaseContext()).toBeUndefined();
  });

  it("fails malformed values before acquiring a client", async () => {
    const { pool } = fakePool();
    await expect(withSiteContext(pool, "browser-controlled", async () => undefined)).rejects.toThrow(/UUID/);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("rejects implicit nested contexts", async () => {
    const outer = fakePool();
    const inner = fakePool();
    await expect(withSiteContext(outer.pool, siteId, () =>
      withDatabaseContext(inner.pool, { actorKind: "owner" }, async () => undefined),
    )).rejects.toThrow(/Nested/);
    expect(inner.pool.connect).not.toHaveBeenCalled();
  });
});
