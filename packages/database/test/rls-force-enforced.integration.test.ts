import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";

const run = Boolean(process.env.RLS_TEST_ADMIN_DATABASE_URL && process.env.RLS_TEST_RUNTIME_DATABASE_URL && process.env.RLS_TEST_OWNER_DATABASE_URL && process.env.RLS_TEST_SYSTEM_DATABASE_URL);
const admin = new pg.Pool({ connectionString: process.env.RLS_TEST_ADMIN_DATABASE_URL });
const runtime = new pg.Pool({ connectionString: process.env.RLS_TEST_RUNTIME_DATABASE_URL, max: 1 });
const owner = new pg.Pool({ connectionString: process.env.RLS_TEST_OWNER_DATABASE_URL, max: 1 });
const system = new pg.Pool({ connectionString: process.env.RLS_TEST_SYSTEM_DATABASE_URL, max: 1 });
const appRoles = [process.env.RLS_TEST_RUNTIME_ROLE!, process.env.RLS_TEST_OWNER_ROLE!, process.env.RLS_TEST_SYSTEM_ROLE!];
const executorRoles = [process.env.RLS_TEST_RUNTIME_EXECUTOR_ROLE!, process.env.RLS_TEST_BOOTSTRAP_EXECUTOR_ROLE!, process.env.RLS_TEST_OWNER_EXECUTOR_ROLE!, process.env.RLS_TEST_SYSTEM_EXECUTOR_ROLE!];

describe.skipIf(!run)("PostgreSQL 16 enforced FORCE-RLS invariants", () => {
  afterAll(async () => Promise.all([admin.end(), runtime.end(), owner.end(), system.end()]));

  it("has an exact 73/70/70 catalog and keeps all table ownership administrative", async () => {
    const rows = (await admin.query(
      `select count(*)::int tables,count(*) filter(where c.relrowsecurity)::int rls,
              count(*) filter(where c.relforcerowsecurity)::int force,
              count(*) filter(where r.rolname=$1)::int migrator_owned
       from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner
       where n.nspname='public' and c.relkind in('r','p')`, [process.env.RLS_TEST_MIGRATOR_ROLE],
    )).rows[0];
    expect(rows).toEqual({ tables: 73, rls: 70, force: 70, migrator_owned: 73 });
  });

  it("keeps executor identities NOLOGIN and without elevated attributes", async () => {
    const rows = (await admin.query(
      `select rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole
       from pg_roles where rolname=any($1::text[]) order by rolname`, [executorRoles],
    )).rows;
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row).toMatchObject({ rolcanlogin: false, rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false });
  });

  it("does not grant application identities membership in executors or migrator", async () => {
    const rows = (await admin.query(
      `select member.rolname member,granted.rolname granted from pg_auth_members m
       join pg_roles member on member.oid=m.member join pg_roles granted on granted.oid=m.roleid
       where member.rolname=any($1::text[]) and granted.rolname=any($2::text[])`,
      [appRoles, [...executorRoles, process.env.RLS_TEST_MIGRATOR_ROLE]],
    )).rows;
    expect(rows).toEqual([]);
  });

  it("rejects SET ROLE to every executor and migrator from every application actor", async () => {
    for (const pool of [runtime, owner, system])
      for (const role of [...executorRoles, process.env.RLS_TEST_MIGRATOR_ROLE!])
        await expect(pool.query(`set role "${role}"`)).rejects.toThrow(/permission denied/i);
  });

  it("does not let a spoofed tenant GUC expose another tenant", async () => {
    const client = await runtime.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.actor_kind','site_admin',true),set_config('app.site_id',$1,true)", [process.env.RLS_TEST_SITE_B]);
      expect((await client.query("select count(*)::int count from sites")).rows[0].count).toBe(0);
      await client.query("rollback");
    } finally { client.release(); }
  });

  it("fails closed when an application actor requests row_security=off and recovers the pooled client", async () => {
    const client = await runtime.connect();
    try {
      await client.query("begin");
      await client.query("set local row_security=off");
      await expect(client.query("select count(*) from sites")).rejects.toThrow(/row-level security/i);
      await client.query("rollback");
    } finally { client.release(); }
    expect((await runtime.query("show row_security")).rows[0].row_security).toBe("on");
  });

  it("prevents application DDL, policy, grant and function replacement", async () => {
    for (const statement of [
      "alter table sites disable row level security",
      "drop policy sites_site_admin_select on sites",
      "grant select on owner_accounts to bsrc_runtime",
      "create or replace function app_context_site_id() returns text language sql as 'select null::text'",
    ]) await expect(runtime.query(statement)).rejects.toThrow(/must be owner|permission denied/i);
  });

  it("subjects the table owner to FORCE when no executor policy applies", async () => {
    const client = await admin.connect();
    try {
      await client.query("begin");
      await client.query(`set local role "${process.env.RLS_TEST_MIGRATOR_ROLE}"`);
      expect((await client.query("select count(*)::int count from sites")).rows[0].count).toBe(0);
      await client.query("rollback");
    } finally { client.release(); }
  });

  it("keeps PUBLIC without application table or application-owned routine access", async () => {
    expect((await admin.query("select count(*)::int count from information_schema.role_table_grants where grantee='PUBLIC' and table_schema='public'")).rows[0].count).toBe(0);
    expect((await admin.query(
      `select count(*)::int count from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and has_function_privilege('public',p.oid,'execute')
         and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass
           and d.objid=p.oid and d.deptype='e')`,
    )).rows[0].count).toBe(0);
  });

  it("keeps the privacy export binding helper on its exact canonical owner and execute boundary", async () => {
    const routine = (await admin.query(
      `select r.rolname owner,
              has_function_privilege('public',p.oid,'execute') public_execute,
              has_function_privilege($1,p.oid,'execute') migrator_execute,
              has_function_privilege($2,p.oid,'execute') owner_executor_execute,
              has_function_privilege($3,p.oid,'execute') runtime_executor_execute,
              has_function_privilege($4,p.oid,'execute') system_executor_execute,
              has_function_privilege($5,p.oid,'execute') runtime_execute,
              has_function_privilege($6,p.oid,'execute') owner_execute,
              has_function_privilege($7,p.oid,'execute') system_execute
       from pg_proc p join pg_roles r on r.oid=p.proowner
       where p.oid=to_regprocedure('public.privacy_export_artifact_binding_valid(public.privacy_export_artifacts)')`,
      [
        process.env.RLS_TEST_MIGRATOR_ROLE,
        process.env.RLS_TEST_OWNER_EXECUTOR_ROLE,
        process.env.RLS_TEST_RUNTIME_EXECUTOR_ROLE,
        process.env.RLS_TEST_SYSTEM_EXECUTOR_ROLE,
        process.env.RLS_TEST_RUNTIME_ROLE,
        process.env.RLS_TEST_OWNER_ROLE,
        process.env.RLS_TEST_SYSTEM_ROLE,
      ],
    )).rows[0];
    expect(routine).toEqual({
      owner: process.env.RLS_TEST_OWNER_EXECUTOR_ROLE,
      public_execute: false,
      migrator_execute: true,
      owner_executor_execute: true,
      runtime_executor_execute: true,
      system_executor_execute: true,
      runtime_execute: false,
      owner_execute: false,
      system_execute: false,
    });
  });

  it("exposes a runtime-only fail-closed readiness assertion", async () => {
    expect((await runtime.query("select database_enforced_readiness() ready")).rows[0].ready).toBe(true);
    await expect(owner.query("select database_enforced_readiness()" )).rejects.toThrow(/permission denied/i);
    await expect(system.query("select database_enforced_readiness()" )).rejects.toThrow(/permission denied/i);
  });
});
