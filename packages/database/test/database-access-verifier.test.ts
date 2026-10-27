import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { portableTableGrants, sameInventory } from "../../../scripts/database-access-verifier.mjs";

describe("database access manifest verifier", () => {
  it("keeps the restricted appointment column grants in catalog order without exposing receipt metadata", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../../config/database-access-manifest.json", import.meta.url), "utf8"));
    const table = manifest.tables.find((entry: { name: string }) => entry.name === "site_appointments");
    const expected = [
      ["created_at", "SELECT"],
      ["customer_message", "SELECT"],
      ["customer_name", "SELECT"],
      ["email", "SELECT"],
      ["id", "SELECT"],
      ["note", "SELECT"],
      ["note", "UPDATE"],
      ["phone", "SELECT"],
      ["preferred_date", "SELECT"],
      ["preferred_time", "SELECT"],
      ["service_title", "SELECT"],
      ["site_id", "SELECT"],
      ["status", "SELECT"],
      ["status", "UPDATE"],
      ["updated_at", "SELECT"],
      ["updated_at", "UPDATE"],
    ].map(([column, privilege]) => ({ column, grantee: "runtime", privilege, grantable: false }));
    expect(table.columnGrants).toEqual(expected);
  });

  it("treats catalog inventories as sets across PostgreSQL ordering differences", () => {
    const manifest = [
      "example(text)",
      "example(timestamp with time zone)",
      "zeta()",
    ];
    expect(sameInventory([...manifest].reverse(), manifest)).toBe(true);
    expect(sameInventory([...manifest, "unexpected()"], manifest)).toBe(false);
    expect(sameInventory(manifest.slice(1), manifest)).toBe(false);
  });

  it("normalizes only PostgreSQL 18's implicit owner MAINTAIN privilege", () => {
    const grants = [
      { grantee: "bsrc_migrator", privilege: "SELECT", grantable: false },
      { grantee: "bsrc_migrator", privilege: "MAINTAIN", grantable: false },
      { grantee: "bsrc_runtime", privilege: "MAINTAIN", grantable: false },
    ];
    expect(portableTableGrants(grants, "bsrc_migrator")).toEqual([
      grants[0],
      grants[2],
    ]);
  });
});
