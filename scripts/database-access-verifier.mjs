import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { databaseRoleNames } from "./database-role-config.mjs";

const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, "../config/database-access-manifest.json"), "utf8"));
const sorted = (value) => [...value].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
export const sameInventory = (left, right) => same(sorted(left), sorted(right));
export const portableTableGrants = (grants, owner) => grants.filter(
  (grant) => !(grant.grantee === owner && grant.privilege === "MAINTAIN"),
);

export async function databaseAccessViolations(pool, mode = "enforced") {
  const violations = [];
  const roles = databaseRoleNames();
  const aliases = new Map(Object.entries(roles).map(([name, role]) => [role, name]));
  aliases.set("PUBLIC", "PUBLIC");
  const roleName = (name) => roles[name] ?? name;
  const normalizeExpression = (expression) => {
    if (expression === null || expression === undefined) return expression ?? null;
    let normalized = expression;
    for (const [name, contract] of Object.entries(manifest.databaseRoles))
      normalized = normalized?.replaceAll(contract.defaultName, roleName(name));
    return normalized;
  };
  const expectedRoleNames = Object.keys(manifest.databaseRoles).map(roleName);
  const catalogRoles = (await pool.query(
    `select rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname=any($1::text[]) order by rolname`,
    [expectedRoleNames],
  )).rows;
  if (catalogRoles.length !== expectedRoleNames.length) violations.push("role inventory differs");
  for (const role of catalogRoles) {
    const expected = manifest.databaseRoles[aliases.get(role.rolname)];
    if (!expected || role.rolcanlogin !== expected.login || role.rolsuper !== expected.superuser ||
        role.rolbypassrls !== expected.bypassRls || role.rolcreatedb || role.rolcreaterole)
      violations.push(`unsafe role ${role.rolname}`);
  }
  const forbiddenMembership = (await pool.query(
    `select member.rolname member,granted.rolname granted from pg_auth_members m
     join pg_roles member on member.oid=m.member join pg_roles granted on granted.oid=m.roleid
     where member.rolname=any($1::text[]) and granted.rolname=any($2::text[])`,
    [[roles.runtime,roles.owner,roles.system],[roles.migrator,roles.runtimeExecutor,roles.bootstrapExecutor,roles.ownerExecutor,roles.systemExecutor]],
  )).rows;
  if (forbiddenMembership.length) violations.push("application role can SET ROLE to a privileged/executor identity");

  const tableNames = manifest.tables.map((table) => table.name);
  const catalogTables = (await pool.query(
    `select c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname owner,
            coalesce((select jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
              'roles',(select jsonb_agg(case when role_oid=0 then 'PUBLIC' else pg_get_userbyid(role_oid) end order by role_oid) from unnest(p.polroles) role_oid),
              'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname)
              from pg_policy p where p.polrelid=c.oid),'[]'::jsonb) policies,
            coalesce((select jsonb_agg(jsonb_build_object('grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,
              'privilege',x.privilege_type,'grantable',x.is_grantable) order by x.grantee,x.privilege_type)
              from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x),'[]'::jsonb) grants
     from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner
     where n.nspname='public' and c.relkind in ('r','p') order by c.relname`,
  )).rows;
  if (!same(catalogTables.map((table) => table.relname), [...tableNames].sort())) violations.push("table inventory differs");
  const catalogColumns = (await pool.query(
    `select c.relname,a.attname,case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end grantee,
            x.privilege_type privilege,x.is_grantable grantable
     from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
     cross join lateral aclexplode(a.attacl) x
     where n.nspname='public' and c.relname=any($1::text[]) and a.attnum>0 and not a.attisdropped
     order by c.relname,a.attname,grantee,privilege`, [tableNames],
  )).rows;
  for (const expected of manifest.tables) {
    const actual = catalogTables.find((table) => table.relname === expected.name);
    if (!actual) continue;
    if (actual.relrowsecurity !== expected.rls || actual.owner !== roleName(expected.owner)) violations.push(`table state differs: ${expected.name}`);
    if (mode === "enforced" && actual.relforcerowsecurity !== expected.forceRls) violations.push(`FORCE differs: ${expected.name}`);
    const expectedPolicies = expected.policies.map((policy) => ({
      ...policy,
      roles: policy.roles.map(roleName),
      using: normalizeExpression(policy.using),
      check: normalizeExpression(policy.check),
    }));
    if (!same(actual.policies, expectedPolicies)) violations.push(`policy inventory differs: ${expected.name}`);
    const expectedGrants = expected.directGrants.map((grant) => ({ ...grant, grantee: roleName(grant.grantee) }));
    if (!same(portableTableGrants(actual.grants, actual.owner), expectedGrants)) violations.push(`table grants differ: ${expected.name}`);
    const actualColumns = catalogColumns.filter((grant) => grant.relname === expected.name)
      .map(({ relname: _relname, attname, ...grant }) => ({ column: attname, ...grant }));
    const expectedColumns = expected.columnGrants.map((grant) => ({ ...grant, grantee: roleName(grant.grantee) }));
    if (!same(actualColumns, expectedColumns)) violations.push(`column grants differ: ${expected.name}`);
  }
  if (mode === "pilot") {
    const forced = catalogTables.filter((table) => table.relforcerowsecurity).length;
    if (![0,63].includes(forced)) violations.push(`pilot has partial FORCE state (${forced}/63)`);
  }

  const catalogRoutines = (await pool.query(
    `select p.oid::regprocedure::text signature,r.rolname owner,p.prosecdef,
            coalesce(p.proconfig,'{}'::text[]) settings,
            coalesce((select jsonb_agg(distinct case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end)
              from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where x.privilege_type='EXECUTE'),'[]'::jsonb) executable
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
     where n.nspname='public' and p.prokind in ('f','p')
       and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
     order by p.oid::regprocedure::text`,
  )).rows;
  if (!sameInventory(catalogRoutines.map((routine) => routine.signature.replace(/^public\./,"")), manifest.routines.map((routine) => routine.signature)))
    violations.push("routine signature inventory differs");
  for (const expected of manifest.routines) {
    const actual = catalogRoutines.find((routine) => routine.signature.replace(/^public\./,"") === expected.signature);
    if (!actual) continue;
    const expectedExecutable = sorted(expected.executableRoles.map(roleName));
    const actualExecutable = sorted(actual.executable);
    if (actual.owner !== roleName(expected.owner) || actual.prosecdef !== (expected.security === "definer") ||
        !same(actual.settings, expected.settings) || !same(actualExecutable, expectedExecutable))
      violations.push(`routine contract differs: ${expected.signature}`);
  }
  return violations;
}
