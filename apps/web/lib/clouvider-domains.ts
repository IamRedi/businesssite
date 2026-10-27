import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile, lstat } from "node:fs/promises";
import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import { normalizeCustomDomainHost } from "./host-security";
import type { DomainDnsRecord } from "./vercel-domains";
type Environment = Record<string, string | undefined>;
export type ClouviderDomainSetup = {
  provider: "clouvider"; domain: string; serviceId: string; siteId: string;
  ownershipVerified: boolean; dnsConfigured: boolean; ready: boolean;
  records: DomainDnsRecord[]; checkedAt: string; attestationFingerprint: string | null;
};
export type ClouviderDomainReceipt = {
  schema: "businesssite.clouvider-domain.v1"; serviceId: string; siteId: string; domain: string;
  ownershipToken: string; targetIPv4: string[]; targetIPv6: string[];
  certificateSha256: string; certificateExpiresAt: string;
  issuedAt: string; validUntil: string; signature: string;
};
export function domainOwnershipToken(serviceId: string, siteId: string, domain: string) {
  return `bsrc-site=${createHash("sha256").update(`v1|${serviceId}|${siteId}|${domain}`).digest("hex")}`;
}
export function canonicalDomainReceipt(r: Omit<ClouviderDomainReceipt, "signature">) {
  return JSON.stringify({ schema: r.schema, serviceId: r.serviceId, siteId: r.siteId, domain: r.domain, ownershipToken: r.ownershipToken, targetIPv4: [...r.targetIPv4].sort(), targetIPv6: [...r.targetIPv6].sort(), certificateSha256: r.certificateSha256, certificateExpiresAt: r.certificateExpiresAt, issuedAt: r.issuedAt, validUntil: r.validUntil });
}
function configuredAuthority(environment: Environment) {
  const serviceId = environment.CLOUVIDER_SERVICE_ID?.trim() ?? "";
  const ipv4 = (environment.CLOUVIDER_DOMAIN_IPV4 ?? "").split(",").map(x => x.trim()).filter(Boolean);
  const ipv6 = (environment.CLOUVIDER_DOMAIN_IPV6 ?? "").split(",").map(x => x.trim()).filter(Boolean);
  if (!/^[1-9][0-9]{0,15}$/.test(serviceId) || !ipv4.length || ipv4.length > 4 || ipv6.length > 4 || ipv4.some(x => isIP(x) !== 4) || ipv6.some(x => isIP(x) !== 6)) throw Error("Exact Clouvider domain authority required.");
  return { serviceId, ipv4, ipv6 };
}
export function verifyDomainReceipt(value: unknown, input: { serviceId: string; siteId: string; domain: string; ipv4: string[]; ipv6: string[]; publicKey: string; now: Date }): ClouviderDomainReceipt | null {
  try {
    if (!value || typeof value !== "object") return null;
    const r = value as ClouviderDomainReceipt;
    const fields = ["schema", "serviceId", "siteId", "domain", "ownershipToken", "targetIPv4", "targetIPv6", "certificateSha256", "certificateExpiresAt", "issuedAt", "validUntil", "signature"];
    if (Object.keys(r).length !== fields.length || Object.keys(r).some(x => !fields.includes(x)) || r.schema !== "businesssite.clouvider-domain.v1" || r.serviceId !== input.serviceId || r.siteId !== input.siteId || r.domain !== input.domain || normalizeCustomDomainHost(r.domain) !== r.domain || r.ownershipToken !== domainOwnershipToken(input.serviceId, input.siteId, input.domain) || !Array.isArray(r.targetIPv4) || !Array.isArray(r.targetIPv6) || JSON.stringify([...r.targetIPv4].sort()) !== JSON.stringify([...input.ipv4].sort()) || JSON.stringify([...r.targetIPv6].sort()) !== JSON.stringify([...input.ipv6].sort()) || !/^[a-f0-9]{64}$/.test(r.certificateSha256)) return null;
    const now = input.now.getTime(), issued = Date.parse(r.issuedAt), until = Date.parse(r.validUntil), cert = Date.parse(r.certificateExpiresAt);
    if (![now, issued, until, cert].every(Number.isFinite) || issued > now + 60_000 || until <= now || until <= issued || until - issued > 7 * 86400_000 || until > cert) return null;
    const key = createPublicKey({ key: Buffer.from(input.publicKey, "base64"), format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ed25519" || !/^[A-Za-z0-9_-]{86}$/.test(r.signature) || !verify(null, Buffer.from(canonicalDomainReceipt(r)), key, Buffer.from(r.signature, "base64url"))) return null;
    return r;
  } catch { return null; }
}
async function loadRootRegistry(environment: Environment): Promise<unknown[]> {
  const directory = environment.CLOUVIDER_DOMAIN_REGISTRY_DIRECTORY?.trim() || "/run/businesssite/domains";
  if (!directory.startsWith("/") || directory.includes("..")) throw Error("Invalid domain registry location.");
  const file = `${directory}/registry.json`, info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || (info.mode & 0o022) !== 0 || info.size > 262_144) throw Error("Root-managed read-only domain registry required.");
  const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(parsed) || parsed.length > 100) throw Error("Invalid domain registry.");
  return parsed;
}
export async function inspectClouviderDomain(domain: string, siteId: string, options: {
  environment?: Environment; now?: Date; registry?: unknown[];
  dns?: { ipv4(name: string): Promise<string[]>; ipv6(name: string): Promise<string[]>; txt(name: string): Promise<string[][]> };
} = {}): Promise<ClouviderDomainSetup> {
  const environment = options.environment ?? process.env;
  if (normalizeCustomDomainHost(domain) !== domain || !/^[A-Za-z0-9_-]{1,100}$/.test(siteId)) throw Error("Exact domain/site binding required.");
  const authority = configuredAuthority(environment), now = options.now ?? new Date();
  const token = domainOwnershipToken(authority.serviceId, siteId, domain);
  const resolver = new Resolver({ timeout: 3_000, tries: 1 });
  const dns = options.dns ?? { ipv4: (name: string) => resolver.resolve4(name), ipv6: (name: string) => resolver.resolve6(name), txt: (name: string) => resolver.resolveTxt(name) };
  const lookups = await Promise.allSettled([dns.ipv4(domain), dns.ipv6(domain), dns.txt(`_businesssite.${domain}`)]);
  const addresses = (i: number) => lookups[i].status === "fulfilled" ? (lookups[i] as PromiseFulfilledResult<string[]>).value : [];
  const texts = lookups[2].status === "fulfilled" ? (lookups[2].value as string[][]).map(x => x.join("")) : [];
  const ipv4 = addresses(0), ipv6 = addresses(1);
  const ownershipVerified = texts.includes(token);
  const v6Known = lookups[1].status === "fulfilled" || ["ENODATA", "ENOTFOUND"].includes(lookups[1].reason?.code);
  const dnsConfigured = v6Known && ipv4.length > 0 && ipv4.every(x => authority.ipv4.includes(x)) && ipv6.every(x => authority.ipv6.includes(x));
  let registry: unknown[];
  try { registry = options.registry ?? await loadRootRegistry(environment); } catch { registry = []; }
  const receipts = registry.map(r => verifyDomainReceipt(r, { ...authority, siteId, domain, publicKey: environment.CLOUVIDER_DOMAIN_ATTESTATION_PUBLIC_KEY ?? "", now })).filter((r): r is ClouviderDomainReceipt => r !== null);
  const receipt = receipts.length === 1 ? receipts[0] : undefined;
  return { provider: "clouvider", domain, serviceId: authority.serviceId, siteId, ownershipVerified, dnsConfigured, ready: Boolean(ownershipVerified && dnsConfigured && receipt), records: [{ type: "TXT", name: `_businesssite.${domain}`, value: token, purpose: "ownership" }, ...authority.ipv4.map(value => ({ type: "A", name: domain, value, purpose: "routing" as const })), ...authority.ipv6.map(value => ({ type: "AAAA", name: domain, value, purpose: "routing" as const }))], checkedAt: now.toISOString(), attestationFingerprint: receipt ? createHash("sha256").update(canonicalDomainReceipt(receipt)).digest("hex") : null };
}
