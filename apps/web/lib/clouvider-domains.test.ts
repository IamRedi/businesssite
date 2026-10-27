import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { canonicalDomainReceipt, domainOwnershipToken, inspectClouviderDomain, type ClouviderDomainReceipt } from "./clouvider-domains";
const keys = generateKeyPairSync("ed25519"), otherKeys = generateKeyPairSync("ed25519");
const now = new Date("2026-10-19T14:00:00Z"), domain = "tenant.example.com", siteId = "tenant-a", serviceId = "10001";
const env = { CLOUVIDER_SERVICE_ID: serviceId, CLOUVIDER_DOMAIN_IPV4: "203.0.113.10", CLOUVIDER_DOMAIN_ATTESTATION_PUBLIC_KEY: keys.publicKey.export({ format: "der", type: "spki" }).toString("base64") };
const token = domainOwnershipToken(serviceId, siteId, domain);
function receipt(overrides: Partial<ClouviderDomainReceipt> = {}, signingKey = keys.privateKey) {
  const r = { schema: "businesssite.clouvider-domain.v1" as const, serviceId, siteId, domain, ownershipToken: token, targetIPv4: ["203.0.113.10"], targetIPv6: [], certificateSha256: "a".repeat(64), certificateExpiresAt: "2026-12-01T00:00:00Z", issuedAt: "2026-10-19T13:00:00Z", validUntil: "2026-10-20T13:00:00Z", signature: "", ...overrides };
  r.signature = sign(null, Buffer.from(canonicalDomainReceipt(r)), signingKey).toString("base64url");return r;
}
const dns = { ipv4: vi.fn(async () => ["203.0.113.10"]), ipv6: vi.fn(async () => [] as string[]), txt: vi.fn(async () => [[token]]) };
describe("Clouvider controlled domain activation", () => {
  it("requires DNS ownership, exact routing and one signed tenant/certificate receipt", async () => {
    expect((await inspectClouviderDomain(domain, siteId, { environment: env, now, dns, registry: [receipt()] })).ready).toBe(true);
    for (const registry of [[], [receipt(), receipt()], [receipt({ siteId: "tenant-b" })], [receipt({ domain: "other.example.com" })], [receipt({ serviceId: "37307" })], [receipt({ validUntil: "2026-10-19T13:59:00Z" })], [receipt({ certificateExpiresAt: "2026-10-19T13:59:00Z" })], [receipt({ validUntil: "2026-11-20T13:00:00Z" })], [receipt({}, otherKeys.privateKey)]]) expect((await inspectClouviderDomain(domain, siteId, { environment: env, now, dns, registry })).ready).toBe(false);
  });
  it("does not treat DNS alone, legacy provider data or tampered signatures as activation", async () => {
    const forged = { ...receipt(), certificateSha256: "b".repeat(64) };
    for (const registry of [[forged], [{ provider: "vercel", ready: true }], [{ ...receipt(), extra: "untrusted" }]]) expect((await inspectClouviderDomain(domain, siteId, { environment: env, now, dns, registry })).ready).toBe(false);
  });
  it("rejects DNS moved elsewhere, wrong ownership and unexpected IPv6", async () => {
    for (const changed of [{ ...dns, ipv4: async () => ["203.0.113.11"] }, { ...dns, txt: async () => [["wrong-token"]] }, { ...dns, ipv6: async () => ["2001:db8::1"] }, { ...dns, ipv4: async () => [] }]) expect((await inspectClouviderDomain(domain, siteId, { environment: env, now, dns: changed, registry: [receipt()] })).ready).toBe(false);
  });
  it("fails closed for DNS errors and never calls a privileged service", async () => {
    const failed = { ...dns, ipv4: async () => { throw Error("DNS failure"); } };
    expect((await inspectClouviderDomain(domain, siteId, { environment: env, now, dns: failed, registry: [receipt()] })).ready).toBe(false);
    const failedIpv6 = { ...dns, ipv6: async () => { throw Object.assign(Error("timeout"), { code: "ETIMEOUT" }); } };
    expect((await inspectClouviderDomain(domain, siteId, { environment: env, now, dns: failedIpv6, registry: [receipt()] })).ready).toBe(false);
    for (const bad of ["localhost", "https://tenant.example.com", "tenant.example.com/path", "tenant.example.com:443"]) await expect(inspectClouviderDomain(bad, siteId, { environment: env, now, dns, registry: [receipt()] })).rejects.toThrow();
    await expect(inspectClouviderDomain(domain, "tenant/other", { environment: env, now, dns, registry: [receipt()] })).rejects.toThrow();
  });
});
