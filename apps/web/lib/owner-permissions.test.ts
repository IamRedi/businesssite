import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hasOwnerPermission, ownerActionPermissions, ownerPermissions,
  ownerRolePermissions, ownerRoutePermissions,
} from "./owner-permissions";

function files(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

function routePath(path: string, root: string, filename: "page.tsx" | "route.ts") {
  const directory = relative(root, path).split(sep).slice(0, -1).join("/");
  return `/${directory}`.replace(/\/$/, "") || "/";
}

describe("owner RBAC policy", () => {
  it("gives owner every declared permission", () => {
    expect([...ownerRolePermissions.owner].sort()).toEqual([...ownerPermissions].sort());
  });

  it("keeps viewer read-only", () => {
    expect(hasOwnerPermission("viewer", "finder.read")).toBe(true);
    expect(hasOwnerPermission("viewer", "websites.read")).toBe(true);
    for (const permission of ["finder.write", "websites.manage", "team.manage", "billing.manage", "ai.manage"] as const)
      expect(hasOwnerPermission("viewer", permission)).toBe(false);
  });

  it("keeps operator away from team, account security and billing management", () => {
    expect(hasOwnerPermission("operator", "finder.write")).toBe(true);
    expect(hasOwnerPermission("operator", "demos.manage")).toBe(true);
    expect(hasOwnerPermission("operator", "team.manage")).toBe(false);
    expect(hasOwnerPermission("operator", "security.accounts")).toBe(false);
    expect(hasOwnerPermission("operator", "billing.manage")).toBe(false);
    expect(hasOwnerPermission("operator", "information.manage")).toBe(false);
  });

  it("keeps admin away from owner identity and MFA administration", () => {
    expect(hasOwnerPermission("admin", "billing.manage")).toBe(true);
    expect(hasOwnerPermission("admin", "audit.read")).toBe(true);
    expect(hasOwnerPermission("admin", "information.manage")).toBe(true);
    expect(hasOwnerPermission("admin", "team.manage")).toBe(false);
    expect(hasOwnerPermission("admin", "security.accounts")).toBe(false);
    expect(hasOwnerPermission("admin", "platform.configure")).toBe(false);
    expect(hasOwnerPermission("operator", "platform.configure")).toBe(false);
    expect(hasOwnerPermission("viewer", "platform.configure")).toBe(false);
    expect(hasOwnerPermission("owner", "platform.configure")).toBe(true);
    expect(hasOwnerPermission("admin", "privacy.read")).toBe(true);
    expect(hasOwnerPermission("admin", "privacy.manage")).toBe(false);
    expect(hasOwnerPermission("operator", "privacy.read")).toBe(false);
    expect(hasOwnerPermission("viewer", "privacy.read")).toBe(false);
    expect(hasOwnerPermission("owner", "privacy.manage")).toBe(true);
  });

  it("limits internal Information management to owner and admin", () => {
    expect(hasOwnerPermission("owner", "information.manage")).toBe(true);
    expect(hasOwnerPermission("admin", "information.manage")).toBe(true);
    expect(hasOwnerPermission("operator", "information.manage")).toBe(false);
    expect(hasOwnerPermission("viewer", "information.manage")).toBe(false);
  });

  it("fails closed for unknown roles and permissions", () => {
    expect(hasOwnerPermission("superadmin", "team.manage")).toBe(false);
    expect(hasOwnerPermission("owner", "everything" as never)).toBe(false);
    expect(hasOwnerPermission(undefined, undefined)).toBe(false);
  });
});

describe("owner route and action inventory", () => {
  it("classifies every owner page and API method explicitly", () => {
    const app = join(process.cwd(), "app");
    const pageKeys = files(join(app, "owner"))
      .filter((path) => path.endsWith("page.tsx"))
      .map((path) => `page:${routePath(path, app, "page.tsx")}`);
    const apiKeys = files(join(app, "api", "owner"))
      .filter((path) => path.endsWith("route.ts"))
      .flatMap((path) => {
        const source = readFileSync(path, "utf8");
        const methods = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((match) => match[1]);
        expect(methods.length, `Undetected HTTP method in ${path}`).toBeGreaterThan(0);
        return methods.map((method) => `api:${method}:${routePath(path, app, "route.ts")}`);
      });
    expect(pageKeys).toHaveLength(18);
    expect(apiKeys).toHaveLength(32);
    expect([...pageKeys, ...apiKeys].sort()).toEqual(Object.keys(ownerRoutePermissions).sort());
  });

  it("enforces every authenticated route in its own server entrypoint", () => {
    const app = join(process.cwd(), "app");
    for (const [key, classification] of Object.entries(ownerRoutePermissions)) {
      if (classification.access !== "authenticated") continue;
      const [, methodOrPath, maybePath] = key.split(":");
      const route = key.startsWith("page:") ? methodOrPath : maybePath;
      const filename = key.startsWith("page:") ? "page.tsx" : "route.ts";
      const path = join(app, route.replace(/^\//, ""), filename);
      const source = readFileSync(path, "utf8");
      expect(source, key).toContain(key.startsWith("page:") ? "requireOwnerPagePermission(" : "authorizeOwnerRequest(");
    }
  });

  it("classifies and enforces every owner server action", () => {
    const sources = files(join(process.cwd(), "app", "owner"))
      .filter((path) => path.endsWith(".tsx"))
      .map((path) => readFileSync(path, "utf8"));
    const actionCount = sources.reduce((count, source) => count + (source.match(/"use server"/g)?.length ?? 0), 0);
    const enforcementCount = sources.reduce((count, source) => count + (source.match(/requireOwnerActionPermission\(/g)?.length ?? 0), 0);
    expect(actionCount).toBe(Object.keys(ownerActionPermissions).length);
    expect(enforcementCount).toBe(actionCount);
  });

  it("has no public owner signup route", () => {
    expect(Object.keys(ownerRoutePermissions).some((key) => key.includes("/owner/signup"))).toBe(false);
  });
});
