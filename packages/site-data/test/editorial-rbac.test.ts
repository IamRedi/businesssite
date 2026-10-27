import { describe, expect, it } from "vitest";
import { roleHasEditorialPermission } from "../src/index";

describe("editorial RBAC", () => {
  it("keeps editors limited to reading and drafting content", () => {
    expect(roleHasEditorialPermission("editor", "article:read")).toBe(true);
    expect(roleHasEditorialPermission("editor", "article:update")).toBe(true);
    expect(roleHasEditorialPermission("editor", "article:submit")).toBe(true);
    expect(roleHasEditorialPermission("editor", "article:publish")).toBe(false);
    expect(roleHasEditorialPermission("editor", "article:delete")).toBe(false);
  });

  it("allows publishers to control publication but not destructive administration", () => {
    expect(roleHasEditorialPermission("publisher", "article:publish")).toBe(true);
    expect(roleHasEditorialPermission("publisher", "article:archive")).toBe(true);
    expect(roleHasEditorialPermission("publisher", "article:delete")).toBe(false);
    expect(roleHasEditorialPermission("publisher", "settings:manage")).toBe(false);
  });

  it("reserves deletion, categories and settings for administrators", () => {
    expect(roleHasEditorialPermission("administrator", "article:delete")).toBe(true);
    expect(roleHasEditorialPermission("administrator", "category:manage")).toBe(true);
    expect(roleHasEditorialPermission("administrator", "settings:manage")).toBe(true);
  });
});
