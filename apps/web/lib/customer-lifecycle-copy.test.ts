import { describe, expect, it } from "vitest";
import { customerLifecycleCopy, lifecycleMessage, localizedCustomerError } from "./customer-lifecycle-copy";

function keys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(strings);
}

describe("customer lifecycle copy", () => {
  it("has structurally identical EN/DE dictionaries", () => {
    expect(keys(customerLifecycleCopy.de).sort()).toEqual(keys(customerLifecycleCopy.en).sort());
  });

  it("never exposes raw error or lifecycle state identifiers", () => {
    expect(localizedCustomerError("de", "provider_stack_trace")).toBe(customerLifecycleCopy.de.errors.unknown);
    expect(lifecycleMessage("de", "read_only", "24.08.2026").body).toContain("24.08.2026");
    expect(strings(customerLifecycleCopy).join(" ")).not.toContain("payment_grace");
  });
});
