import type { Pool } from "pg";

export function sameInventory(left: unknown[], right: unknown[]): boolean;
export function portableTableGrants<T extends { grantee: string; privilege: string }>(grants: T[], owner: string): T[];
export function databaseAccessViolations(pool: Pool, mode?: string): Promise<string[]>;
