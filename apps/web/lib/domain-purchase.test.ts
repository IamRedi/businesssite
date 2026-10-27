import { describe, expect, it } from "vitest";
import { configuredDomainRegistrar } from "./domain-purchase";

describe("domain registrar redirect configuration", () => {
  it("accepts only an explicit HTTPS destination", () => {
    expect(configuredDomainRegistrar({
      DOMAIN_REGISTRAR_URL: "https://registrar.example/search",
      DOMAIN_REGISTRAR_NAME: "Example Registrar",
    })).toEqual({ name: "Example Registrar", url: "https://registrar.example/search" });
    expect(configuredDomainRegistrar({ DOMAIN_REGISTRAR_URL: "http://registrar.example" })).toBeNull();
    expect(configuredDomainRegistrar({ DOMAIN_REGISTRAR_URL: "javascript:alert(1)" })).toBeNull();
  });

  it("remains disabled when no registrar is configured", () => {
    expect(configuredDomainRegistrar({})).toBeNull();
  });
});
