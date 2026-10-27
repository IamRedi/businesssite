import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { databaseRoleNames, migrationConnectionString } from "./database-role-config.mjs";

const path = resolve(import.meta.dirname, "../config/database-access-manifest.json");
const current = JSON.parse(readFileSync(path, "utf8"));
const roles = databaseRoleNames();
const roleAliases = new Map(Object.entries(roles).map(([alias, role]) => [role, alias]));
roleAliases.set("PUBLIC", "PUBLIC");
const alias = (role) => roleAliases.get(role) ?? role;
const classified = Object.entries(current.tableClasses).flatMap(([tableClass, tables]) =>
  tables.map((table) => ({ table, tableClass })),
);
const tableNames = classified.map(({ table }) => table);
const tableClass = new Map(classified.map((item) => [item.table, item.tableClass]));
const pool = new pg.Pool({ connectionString: migrationConnectionString(), application_name: "bsrc-manifest-generator" });

try {
  const tables = (await pool.query(
    `select c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname owner,
            coalesce((select jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
              'roles',(select jsonb_agg(case when role_oid=0 then 'PUBLIC' else pg_get_userbyid(role_oid) end order by role_oid) from unnest(p.polroles) role_oid),
              'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname)
              from pg_policy p where p.polrelid=c.oid),'[]'::jsonb) policies,
            coalesce((select jsonb_agg(jsonb_build_object('grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,
              'privilege',x.privilege_type,'grantable',x.is_grantable) order by x.grantee,x.privilege_type)
              from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x),'[]'::jsonb) grants
     from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner
     where n.nspname='public' and c.relkind in ('r','p') and c.relname=any($1::text[]) order by c.relname`,
    [tableNames],
  )).rows;
  const columns = (await pool.query(
    `select c.relname,a.attname,case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end grantee,
            x.privilege_type privilege,x.is_grantable grantable
     from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
     cross join lateral aclexplode(a.attacl) x
     where n.nspname='public' and c.relname=any($1::text[]) and a.attnum>0 and not a.attisdropped
     order by c.relname,a.attname,grantee,privilege`, [tableNames],
  )).rows;
  const columnGrants = new Map();
  for (const row of columns) {
    const rows = columnGrants.get(row.relname) ?? [];
    rows.push({ column: row.attname, grantee: alias(row.grantee), privilege: row.privilege, grantable: row.grantable });
    columnGrants.set(row.relname, rows);
  }
  const routineRows = (await pool.query(
    `select p.oid,p.oid::regprocedure::text signature,p.proname,r.rolname owner,p.prosecdef,
            coalesce(p.proconfig,'{}'::text[]) settings,pg_get_functiondef(p.oid) definition,
            coalesce((select jsonb_agg(distinct case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end)
              from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where x.privilege_type='EXECUTE'),'[]'::jsonb) executable
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
     where n.nspname='public' and p.prokind in ('f','p')
       and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
     order by p.oid::regprocedure::text`,
  )).rows;
  const routines = routineRows.map((row) => {
    const touchedTables = tableNames.filter((table) => new RegExp(`\\b${table}\\b`, "i").test(row.definition));
    const owner = alias(row.owner);
    const actor = owner === "bootstrapExecutor" ? "runtime" : owner === "runtimeExecutor" ? "runtime" :
      owner === "ownerExecutor" ? "owner" : owner === "systemExecutor" ? "system" : "migrator";
    const classification = owner === "bootstrapExecutor" ? "bootstrap" : owner.endsWith?.("Executor") ? "authenticated" :
      row.prosecdef ? "administrative" : "internal";
    return {
      signature: row.signature.replace(/^public\./, ""),
      owner,
      security: row.prosecdef ? "definer" : "invoker",
      settings: row.settings,
      executableRoles: row.executable.map(alias).sort(),
      touchedTables,
      touchedTableClasses: [...new Set(touchedTables.map((table) => tableClass.get(table)))].sort(),
      actor,
      purpose: row.proname,
      classification,
    };
  });
  const output = {
    ...current,
    version: 2,
    databaseRoles: Object.fromEntries(Object.entries(roles).map(([name, role]) => [name, {
      defaultName: role,
      login: false,
      superuser: false,
      bypassRls: false,
      ownsTables: name === "migrator",
    }])),
    tables: tables.map((row) => ({
      name: row.relname,
      class: tableClass.get(row.relname),
      rls: row.relrowsecurity,
      forceRls: row.relforcerowsecurity,
      owner: alias(row.owner),
      policies: row.policies.map((policy) => ({ ...policy, roles: policy.roles.map(alias) })),
      directGrants: row.grants.map((grant) => ({ ...grant, grantee: alias(grant.grantee) })),
      columnGrants: columnGrants.get(row.relname) ?? [],
    })),
    routines,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} finally {
  await pool.end();
}
